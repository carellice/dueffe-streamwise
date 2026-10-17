package it.dueffe.streamwise;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Actors and directors the user follows for new films and series.
 * Each follow keeps every credit already known, so only titles added to TMDB afterwards are notified.
 * Stored only on the device; ReleaseCheckWorker compares it periodically with TMDB.
 */
final class PersonFollows {
    static final String PREFS="followed-people";
    private static final Object LOCK=new Object();
    /** Credits released longer ago than this are late additions to TMDB, not news. */
    private static final int RECENT_DAYS=120;

    static final class Follow {
        Models.Person person; long followedAt; boolean initialized; Set<String> known=new LinkedHashSet<>();
        String key(){return PersonFollows.key(person);}
        JSONObject json(){
            JSONObject o=new JSONObject();
            Models.put(o,"person",person.json());Models.put(o,"followedAt",followedAt);Models.put(o,"initialized",initialized);
            Models.put(o,"known",new JSONArray(known));
            return o;
        }
        static Follow from(JSONObject o){
            Follow f=new Follow();JSONObject person=o.optJSONObject("person");f.person=Models.Person.from(person==null?new JSONObject():person);
            f.followedAt=o.optLong("followedAt");f.initialized=o.optBoolean("initialized");f.known.addAll(Models.strings(o.optJSONArray("known")));
            return f;
        }
    }

    static String key(Models.Person p){return (p.director?"director-":"person-")+p.id;}
    static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static boolean isFollowed(Context c,Models.Person p){return prefs(c).contains(key(p));}
    static List<Follow> all(Context c){
        List<Follow> out=new ArrayList<>();
        for(Map.Entry<String,?> entry:prefs(c).getAll().entrySet()){
            if(!(entry.getValue() instanceof String))continue;
            try{Follow f=Follow.from(new JSONObject((String)entry.getValue()));if(f.person.id>0)out.add(f);}catch(Exception ignored){}
        }
        out.sort((a,b)->a.person.name.toLowerCase(Locale.ITALIAN).compareTo(b.person.name.toLowerCase(Locale.ITALIAN)));
        return out;
    }
    static List<Models.Person> people(Context c){List<Models.Person> out=new ArrayList<>();for(Follow f:all(c))out.add(f.person);return out;}

    /** Starts following; the first check records the current filmography silently. */
    static void follow(Context c,Models.Person person){
        Follow f=new Follow();f.person=person;f.followedAt=System.currentTimeMillis();
        synchronized(LOCK){prefs(c).edit().putString(f.key(),f.json().toString()).commit();}
        ReleaseCheckWorker.schedule(c);
        ReleaseCheckWorker.checkNow(c);
    }
    static void unfollow(Context c,Models.Person person){
        synchronized(LOCK){prefs(c).edit().remove(key(person)).commit();}
        ReleaseCheckWorker.schedule(c);
    }
    /** Saves a checked follow unless the user stopped following in the meantime. */
    static boolean update(Context c,Follow f){
        synchronized(LOCK){
            String stored=prefs(c).getString(f.key(),null),value=f.json().toString();
            if(stored==null)return false;
            return stored.equals(value)||prefs(c).edit().putString(f.key(),value).commit();
        }
    }
    static JSONArray exportJson(Context c){JSONArray out=new JSONArray();for(Follow f:all(c))out.put(f.json());return out;}
    static void importJson(Context c,JSONArray follows){
        synchronized(LOCK){
            SharedPreferences.Editor editor=prefs(c).edit().clear();
            for(int i=0;i<follows.length();i++){
                JSONObject o=follows.optJSONObject(i);if(o==null)continue;
                Follow f=Follow.from(o);if(f.person.id>0)editor.putString(f.key(),f.json().toString());
            }
            editor.commit();
        }
        ReleaseCheckWorker.schedule(c);
    }

    /**
     * Compares the full filmography (talk shows included, so toggling the filter never looks like news)
     * with the known credits and returns the new titles worth announcing.
     */
    static List<Models.Media> evaluate(Follow f,List<Models.Media> credits,Set<String> hiddenShows,LocalDate today){
        List<Models.Media> fresh=new ArrayList<>();
        boolean first=!f.initialized;
        for(Models.Media m:credits){
            if(!f.known.add(m.id)||first)continue;
            if(hiddenShows.contains(m.id))continue;
            if(!m.releaseDate.isEmpty()&&m.releaseDate.compareTo(today.minusDays(RECENT_DAYS).toString())<0)continue;
            fresh.add(m);
        }
        f.initialized=true;
        return fresh;
    }

    static String noticeText(Models.Media m,LocalDate today){
        String kind=m.isSeries()?"Nuova serie":"Nuovo film";
        if(m.releaseDate.isEmpty())return kind+": «"+m.title+"» · data da annunciare.";
        boolean future=m.releaseDate.compareTo(today.toString())>0;
        return kind+": «"+m.title+"» · "+(future?"esce ":"uscito ")+ReleaseFollows.relativeDay(m.releaseDate,today,future)+".";
    }
}
