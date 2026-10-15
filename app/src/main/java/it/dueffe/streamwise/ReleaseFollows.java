package it.dueffe.streamwise;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Titles the user follows for new episodes (series) or Italian releases and streaming arrival (films).
 * Each follow keeps the last state already announced, so every episode or release is notified only once.
 * Stored only on the device; ReleaseCheckWorker compares it periodically with TMDB.
 */
final class ReleaseFollows {
    static final String PREFS="followed-releases";
    private static final Object LOCK=new Object();
    private static final DateTimeFormatter LONG=DateTimeFormatter.ofPattern("EEEE d MMMM",Locale.ITALIAN);
    private static final DateTimeFormatter LONG_YEAR=DateTimeFormatter.ofPattern("d MMMM yyyy",Locale.ITALIAN);
    private static final DateTimeFormatter SHORT=DateTimeFormatter.ofPattern("d MMM",Locale.ITALIAN);

    static final class Follow {
        Models.Media media; long followedAt; boolean initialized; String status="";
        // Series: latest episode already announced, and the next scheduled one shown in the app.
        int lastSeason,lastEpisode,nextSeason,nextEpisode,announcedSeason; String lastAirDate="",nextAirDate="",nextName="";
        // Films: Italian release date (theatrical first, then digital) and streaming arrival.
        String releaseDate="",releaseKind="",streamingNames=""; boolean releaseNotified,streamingNotified;

        boolean series(){return media.isSeries();}
        boolean completed(){return initialized&&!series()&&streamingNotified;}
        String upcomingDate(LocalDate today){
            String date=series()?nextAirDate:releaseDate;
            return !date.isEmpty()&&date.compareTo(today.toString())>=0&&!completed()?date:"";
        }
        JSONObject json(){
            JSONObject o=new JSONObject();
            Models.put(o,"media",media.json());Models.put(o,"followedAt",followedAt);Models.put(o,"initialized",initialized);Models.put(o,"status",status);
            Models.put(o,"lastSeason",lastSeason);Models.put(o,"lastEpisode",lastEpisode);Models.put(o,"lastAirDate",lastAirDate);
            Models.put(o,"nextSeason",nextSeason);Models.put(o,"nextEpisode",nextEpisode);Models.put(o,"nextAirDate",nextAirDate);Models.put(o,"nextName",nextName);Models.put(o,"announcedSeason",announcedSeason);
            Models.put(o,"releaseDate",releaseDate);Models.put(o,"releaseKind",releaseKind);Models.put(o,"streamingNames",streamingNames);
            Models.put(o,"releaseNotified",releaseNotified);Models.put(o,"streamingNotified",streamingNotified);
            return o;
        }
        static Follow from(JSONObject o){
            Follow f=new Follow();JSONObject media=o.optJSONObject("media");f.media=Models.Media.from(media==null?new JSONObject():media);
            f.followedAt=o.optLong("followedAt");f.initialized=o.optBoolean("initialized");f.status=o.optString("status");
            f.lastSeason=o.optInt("lastSeason");f.lastEpisode=o.optInt("lastEpisode");f.lastAirDate=o.optString("lastAirDate");
            f.nextSeason=o.optInt("nextSeason");f.nextEpisode=o.optInt("nextEpisode");f.nextAirDate=o.optString("nextAirDate");f.nextName=o.optString("nextName");f.announcedSeason=o.optInt("announcedSeason");
            f.releaseDate=o.optString("releaseDate");f.releaseKind=o.optString("releaseKind");f.streamingNames=o.optString("streamingNames");
            f.releaseNotified=o.optBoolean("releaseNotified");f.streamingNotified=o.optBoolean("streamingNotified");
            return f;
        }
    }

    static final class Notice {
        final String kind,title,text;
        Notice(String kind,String title,String text){this.kind=kind;this.title=title;this.text=text;}
    }

    static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static boolean isFollowed(Context c,String id){return prefs(c).contains(id);}
    static Follow get(Context c,String id){
        String raw=prefs(c).getString(id,null);if(raw==null)return null;
        try{return Follow.from(new JSONObject(raw));}catch(Exception e){return null;}
    }
    static List<Follow> all(Context c){
        List<Follow> out=new ArrayList<>();
        for(Map.Entry<String,?> entry:prefs(c).getAll().entrySet()){
            if(!(entry.getValue() instanceof String))continue;
            try{Follow f=Follow.from(new JSONObject((String)entry.getValue()));if(!f.media.id.isEmpty())out.add(f);}catch(Exception ignored){}
        }
        LocalDate today=LocalDate.now(TvGuideRepository.ROME);
        // Dated upcoming releases first (soonest on top), then undated ones, finally films already streaming.
        out.sort(Comparator.<Follow>comparingInt(f->f.completed()?2:f.upcomingDate(today).isEmpty()?1:0)
            .thenComparing(f->f.upcomingDate(today))
            .thenComparing(f->f.media.title.toLowerCase(Locale.ITALIAN)));
        return out;
    }

    /** Starts following. With fresh release data the baseline is fixed now; otherwise the worker sets it on its first check. */
    static Follow follow(Context c,Models.Media media,TmdbApi.ReleaseInfo info){
        Follow f=new Follow();f.media=media;f.followedAt=System.currentTimeMillis();
        if(info!=null)initialize(f,info,LocalDate.now(TvGuideRepository.ROME));
        synchronized(LOCK){prefs(c).edit().putString(media.id,f.json().toString()).commit();}
        ReleaseCheckWorker.schedule(c);
        if(info==null)ReleaseCheckWorker.checkNow(c);
        return f;
    }
    static void unfollow(Context c,String id){
        synchronized(LOCK){prefs(c).edit().remove(id).commit();}
        ReleaseCheckWorker.schedule(c);
    }
    /** Saves a checked follow unless the user stopped following it in the meantime. */
    static boolean update(Context c,Follow f){
        synchronized(LOCK){
            String stored=prefs(c).getString(f.media.id,null),value=f.json().toString();
            if(stored==null)return false;
            // Unchanged follows are not rewritten, so periodic checks do not wake up the open app.
            return stored.equals(value)||prefs(c).edit().putString(f.media.id,value).commit();
        }
    }
    static JSONArray exportJson(Context c){JSONArray out=new JSONArray();for(Follow f:all(c))out.put(f.json());return out;}
    static void importJson(Context c,JSONArray follows){
        synchronized(LOCK){
            SharedPreferences.Editor editor=prefs(c).edit().clear();
            for(int i=0;i<follows.length();i++){
                JSONObject o=follows.optJSONObject(i);if(o==null)continue;
                Follow f=Follow.from(o);if(!f.media.id.isEmpty())editor.putString(f.media.id,f.json().toString());
            }
            editor.commit();
        }
        ReleaseCheckWorker.schedule(c);
    }

    /** Records the current state as already known: following never notifies about past releases. */
    static void initialize(Follow f,TmdbApi.ReleaseInfo info,LocalDate today){
        f.status=info.status;
        if(f.series()){
            int[] latest=latestAired(info,today);
            if(latest!=null){f.lastSeason=latest[0];f.lastEpisode=latest[1];f.lastAirDate=latest[0]==info.nextSeason&&latest[1]==info.nextEpisode?info.nextAirDate:info.lastAirDate;}
            setNext(f,info,today);
            f.announcedSeason=info.hasNext()&&info.nextEpisode==1?info.nextSeason:0;
        }else{
            setRelease(f,info);
            boolean available=!info.streaming.isEmpty();
            f.releaseNotified=available||released(f,today);f.streamingNotified=available;
        }
        f.initialized=true;
    }

    /** Applies fresh TMDB data and returns what deserves a notification. */
    static List<Notice> evaluate(Follow f,TmdbApi.ReleaseInfo info,LocalDate today){
        List<Notice> notices=new ArrayList<>();
        if(!f.initialized){initialize(f,info,today);return notices;}
        f.status=info.status;
        if(f.series()){
            int[] latest=latestAired(info,today);
            if(latest!=null&&compare(latest[0],latest[1],f.lastSeason,f.lastEpisode)>0){
                boolean fromNext=latest[0]==info.nextSeason&&latest[1]==info.nextEpisode;
                String date=fromNext?info.nextAirDate:info.lastAirDate,name=fromNext?info.nextName:info.lastName;
                notices.add(new Notice("episode",f.media.title,episodeText(f,latest[0],latest[1],date,name,today)));
                f.lastSeason=latest[0];f.lastEpisode=latest[1];f.lastAirDate=date;
            }
            setNext(f,info,today);
            if(info.hasNext()&&info.nextEpisode==1&&info.nextSeason>f.lastSeason&&info.nextSeason!=f.announcedSeason&&info.nextAirDate.compareTo(today.toString())>0){
                notices.add(new Notice("season",f.media.title,"La stagione "+info.nextSeason+" arriva "+relativeDay(info.nextAirDate,today,true)+". Ti avviserò all’uscita di ogni episodio."));
                f.announcedSeason=info.nextSeason;
            }
            return notices;
        }
        setRelease(f,info);
        boolean available=!info.streaming.isEmpty();
        if(!f.releaseNotified&&available){
            notices.add(new Notice("streaming",f.media.title,"Ora disponibile in streaming su "+f.streamingNames+"."));
            f.releaseNotified=true;f.streamingNotified=true;
        }else if(!f.releaseNotified&&released(f,today)){
            notices.add(new Notice("release",f.media.title,releaseText(f,today)));
            f.releaseNotified=true;
        }else if(f.releaseNotified&&!f.streamingNotified&&available){
            notices.add(new Notice("streaming",f.media.title,"È arrivato in streaming su "+f.streamingNames+"."));
            f.streamingNotified=true;
        }
        return notices;
    }

    /** Whether following still makes sense: an ended series or a film already streaming has nothing left to announce. */
    static boolean worthFollowing(Models.Media media,TmdbApi.ReleaseInfo info){
        return media.isSeries()?!info.ended()||info.hasNext():info.streaming.isEmpty();
    }

    /** Full sentence for the detail page. */
    static String describe(Follow f,LocalDate today){
        if(f.series()){
            if(f.nextSeason>0&&f.nextEpisode>0){
                if(f.nextAirDate.isEmpty())return "Prossimo episodio: S"+f.nextSeason+" · E"+f.nextEpisode+" · data da confermare";
                if(f.nextEpisode==1)return "La stagione "+f.nextSeason+" arriva "+relativeDay(f.nextAirDate,today,true);
                return "Prossimo episodio: S"+f.nextSeason+" · E"+f.nextEpisode+" "+relativeDay(f.nextAirDate,today,true);
            }
            switch(f.status){
                case "Ended": return "Serie conclusa: non sono previsti nuovi episodi";
                case "Canceled": return "Serie cancellata: non sono previsti nuovi episodi";
                case "Returning Series": return "Nuovi episodi non ancora annunciati";
                case "In Production": case "Planned": case "Pilot": return "In produzione: data di uscita non ancora annunciata";
                default: return "Nessun episodio in programma al momento";
            }
        }
        if(f.streamingNotified&&!f.streamingNames.isEmpty())return "Disponibile in streaming su "+f.streamingNames;
        if(f.releaseDate.isEmpty())return "Data di uscita italiana da confermare";
        String where="cinema".equals(f.releaseKind)?"al cinema":"digital".equals(f.releaseKind)?"in digitale":"";
        if(f.releaseDate.compareTo(today.toString())>0)
            return ("cinema".equals(f.releaseKind)?"Al cinema ":"digital".equals(f.releaseKind)?"In digitale ":"Uscita prevista ")+(where.isEmpty()?relativeDay(f.releaseDate,today,false).replaceFirst("^il ",""):relativeDay(f.releaseDate,today,false).replaceFirst("^il ","dal "));
        return "Uscito "+(where.isEmpty()?"":where+" ")+relativeDay(f.releaseDate,today,false)+" · non ancora in streaming";
    }

    /** Compact label under a poster. */
    static String shortLabel(Follow f,LocalDate today){
        if(!f.initialized)return "Controllo in corso…";
        if(f.series()){
            if(f.nextSeason>0&&f.nextEpisode>0){
                String date=f.nextAirDate.isEmpty()?"data da confermare":shortDay(f.nextAirDate,today);
                return (f.nextEpisode==1?"Stagione "+f.nextSeason:"S"+f.nextSeason+" · E"+f.nextEpisode)+" · "+date;
            }
            return "Ended".equals(f.status)||"Canceled".equals(f.status)?"Serie conclusa":"Data da annunciare";
        }
        if(f.streamingNotified)return "In streaming";
        if(f.releaseDate.isEmpty())return "Data da confermare";
        if(f.releaseDate.compareTo(today.toString())>0)return "Esce "+shortDay(f.releaseDate,today);
        return "Uscito · attesa streaming";
    }

    private static void setNext(Follow f,TmdbApi.ReleaseInfo info,LocalDate today){
        boolean upcoming=info.hasNext()&&(info.nextAirDate.isEmpty()||info.nextAirDate.compareTo(today.toString())>0);
        f.nextSeason=upcoming?info.nextSeason:0;f.nextEpisode=upcoming?info.nextEpisode:0;
        f.nextAirDate=upcoming?info.nextAirDate:"";f.nextName=upcoming?info.nextName:"";
    }
    private static void setRelease(Follow f,TmdbApi.ReleaseInfo info){
        if(!info.theatricalDate.isEmpty()){f.releaseDate=info.theatricalDate;f.releaseKind="cinema";}
        else if(!info.digitalDate.isEmpty()){f.releaseDate=info.digitalDate;f.releaseKind="digital";}
        else{f.releaseDate=info.fallbackDate;f.releaseKind="";}
        List<String> names=new ArrayList<>();for(Models.Provider p:info.streaming)if(names.size()<3&&!names.contains(p.name))names.add(p.name);
        f.streamingNames=String.join(", ",names);
    }
    private static boolean released(Follow f,LocalDate today){return !f.releaseDate.isEmpty()&&f.releaseDate.compareTo(today.toString())<=0;}

    /** Most recent episode whose date has arrived in Italy, from TMDB's last and next episode fields. */
    static int[] latestAired(TmdbApi.ReleaseInfo info,LocalDate today){
        int[] best=null;String limit=today.toString();
        if(info.lastSeason>0&&info.lastEpisode>0&&(info.lastAirDate.isEmpty()||info.lastAirDate.compareTo(limit)<=0))best=new int[]{info.lastSeason,info.lastEpisode};
        if(info.hasNext()&&!info.nextAirDate.isEmpty()&&info.nextAirDate.compareTo(limit)<=0&&(best==null||compare(info.nextSeason,info.nextEpisode,best[0],best[1])>0))best=new int[]{info.nextSeason,info.nextEpisode};
        return best;
    }
    private static int compare(int seasonA,int episodeA,int seasonB,int episodeB){return seasonA!=seasonB?Integer.compare(seasonA,seasonB):Integer.compare(episodeA,episodeB);}

    private static String episodeText(Follow f,int season,int episode,String date,String name,LocalDate today){
        String when=date.isEmpty()||date.equals(today.toString())?"oggi":relativeDay(date,today,false);
        String title=meaningfulName(name)?" «"+name+"»":"";
        if(season==f.lastSeason){
            int count=episode-f.lastEpisode;
            if(count>1)return count+" nuovi episodi, fino a S"+season+" · E"+episode+title+" (uscita "+when+").";
            return "Nuovo episodio "+("oggi".equals(when)?"in uscita oggi":"uscito "+when)+": S"+season+" · E"+episode+title+".";
        }
        if(episode==1)return "Inizia la stagione "+season+": episodio 1"+title+" "+("oggi".equals(when)?"in uscita oggi":"uscito "+when)+".";
        return "Stagione "+season+" disponibile: "+episode+" episodi usciti, fino a E"+episode+title+".";
    }
    private static String releaseText(Follow f,LocalDate today){
        boolean isToday=f.releaseDate.equals(today.toString());
        String when=isToday?"oggi":relativeDay(f.releaseDate,today,false);
        if("cinema".equals(f.releaseKind))return (isToday?"Esce oggi al cinema in Italia.":"Uscito al cinema "+when+".")+" Ti avviserò quando arriverà in streaming.";
        if("digital".equals(f.releaseKind))return (isToday?"Disponibile da oggi":"Disponibile da "+when)+" a noleggio o in acquisto digitale. Ti avviserò quando arriverà in streaming.";
        return (isToday?"Esce oggi.":"È uscito "+when+".")+" Ti avviserò quando arriverà in streaming.";
    }
    private static boolean meaningfulName(String name){
        return name!=null&&!name.trim().isEmpty()&&!name.trim().matches("(?i)(episodio|episode)\\s*\\d+");
    }
    /** "oggi", "domani", "ieri", "giovedì 23 ottobre" (with the year when it differs). */
    static String relativeDay(String iso,LocalDate today,boolean weekday){
        try{
            LocalDate date=LocalDate.parse(iso);
            if(date.equals(today))return "oggi";
            if(date.equals(today.plusDays(1)))return "domani";
            if(date.equals(today.minusDays(1)))return "ieri";
            if(date.getYear()!=today.getYear())return "il "+date.format(LONG_YEAR);
            return weekday&&date.isAfter(today)?date.format(LONG):"il "+date.format(DateTimeFormatter.ofPattern("d MMMM",Locale.ITALIAN));
        }catch(Exception e){return "a data da confermare";}
    }
    private static String shortDay(String iso,LocalDate today){
        try{
            LocalDate date=LocalDate.parse(iso);
            if(date.equals(today))return "oggi";
            if(date.equals(today.plusDays(1)))return "domani";
            return date.format(date.getYear()!=today.getYear()?DateTimeFormatter.ofPattern("d MMM yyyy",Locale.ITALIAN):SHORT);
        }catch(Exception e){return "data da confermare";}
    }
}
