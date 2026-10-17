package it.dueffe.streamwise;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Date;

final class LibraryStore {
    private final SharedPreferences prefs;
    private final Context context;
    private final Map<String, Models.LibraryEntry> entries=new LinkedHashMap<>();
    LibraryStore(Context context){ this.context=context.getApplicationContext(); prefs=context.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE); load(); }
    Collection<Models.LibraryEntry> all(){ return entries.values(); }
    Models.LibraryEntry get(Models.Media media){ return entries.get(media.id); }
    String state(Models.Media media){ Models.LibraryEntry e=get(media); return e==null?"":e.state; }
    List<Models.Media> byState(String state){ List<Models.Media> out=new ArrayList<>(); for(Models.LibraryEntry e:entries.values())if(state.equals(e.state))out.add(e.media); return out; }
    List<Models.LibraryEntry> entriesByState(String state){ List<Models.LibraryEntry> out=new ArrayList<>(); for(Models.LibraryEntry e:entries.values())if(state.equals(e.state))out.add(e); return out; }
    void togglePinned(Models.Media media){Models.LibraryEntry e=entries.get(media.id);if(e!=null){e.pinned=!e.pinned;persist();}}
    java.util.Set<Integer> subscriptions(){
        String raw=prefs.getString("subscriptions","[]");
        java.util.Set<Integer> ids=subscriptionIds(raw);
        // Convert the previous monthly selection once, retaining the current or latest choice.
        if(raw.trim().startsWith("{"))setSubscriptions(ids);
        return ids;
    }
    void setSubscriptions(java.util.Set<Integer> ids){
        prefs.edit().putString("subscriptions",new JSONArray(ids).toString()).apply();
    }
    private static java.util.Set<Integer> subscriptionIds(String raw){
        java.util.Set<Integer> ids=new java.util.LinkedHashSet<>();JSONArray array=null;
        try{
            if(raw.trim().startsWith("{")){
                JSONObject months=new JSONObject(raw);
                String current=java.time.YearMonth.now(TvGuideRepository.ROME).toString();
                array=months.optJSONArray(current);
                if(array==null){
                    String latest="";java.util.Iterator<String> keys=months.keys();
                    while(keys.hasNext()){
                        String key=keys.next();
                        try{java.time.YearMonth.parse(key);if(months.optJSONArray(key)!=null&&key.compareTo(latest)>0)latest=key;}catch(Exception ignored){}
                    }
                    array=months.optJSONArray(latest);
                }
            }else array=new JSONArray(raw);
        }catch(Exception ignored){}
        if(array!=null)for(int i=0;i<array.length();i++)if(array.optInt(i)>0)ids.add(SubscriptionRepository.serviceId(array.optInt(i)));
        return ids;
    }
    String subscriptionFilter(String section){return prefs.getString("subscription-filter-"+section,"{}");}
    void setSubscriptionFilter(String section,String json){prefs.edit().putString("subscription-filter-"+section,json).apply();}
    String librarySort(String section){return prefs.getString("library-sort-"+section,"TITLE");}
    void setLibrarySort(String section,String sort){prefs.edit().putString("library-sort-"+section,sort).apply();}
    void save(Models.Media media){ Models.LibraryEntry e=entry(media); e.state=media.isSeries()?"progress":"saved"; if(media.isSeries()){e.nextSeason=1;e.nextEpisode=1;e.watchedSeason=null;e.watchedEpisode=null;} persist(); }
    void watched(Models.Media media,boolean liked){ Models.LibraryEntry e=entry(media); e.state="watched"; e.liked=liked; persist(); }
    void markMovieUnwatched(Models.Media media){ Models.LibraryEntry e=entry(media); e.state="saved"; e.liked=null; persist(); }
    void setLiked(Models.Media media,boolean liked){ Models.LibraryEntry e=entries.get(media.id); if(e!=null&&"watched".equals(e.state)){e.liked=liked;persist();} }
    void hide(Models.Media media){ Models.LibraryEntry e=entry(media); e.state="hidden"; persist(); }
    void restore(Models.Media media){ entries.remove(media.id); persist(); }
    void remove(Models.Media media){ entries.remove(media.id); persist(); }
    void mergeDetails(Models.Media media){ Models.LibraryEntry e=entries.get(media.id); if(e!=null){e.media=media;persist();} }
    void restart(Models.Media media){ Models.LibraryEntry e=entry(media); e.state="progress";e.nextSeason=1;e.nextEpisode=1;e.watchedSeason=null;e.watchedEpisode=null;e.completedEpisodeCount=0;persist(); }
    void markEpisode(Models.Media media, Models.Episode episode, List<Models.Season> seasons,Boolean liked){
        Models.LibraryEntry e=entry(media); List<Models.Episode> all=flatten(seasons); int index=indexOf(all,episode);
        if(index<0) return;
        if(index==all.size()-1&&liked==null&&e.liked==null) throw new IllegalArgumentException("A reaction is required to finish a series");
        e.watchedSeason=episode.season;e.watchedEpisode=episode.number;
        if(index>=0&&index+1<all.size()){ Models.Episode next=all.get(index+1);e.state="progress";e.nextSeason=next.season;e.nextEpisode=next.number; }
        else { e.state="watched";e.completedEpisodeCount=all.size();if(liked!=null)e.liked=liked; }
        persist();
    }
    void unwatchEpisode(Models.Media media, Models.Episode episode, List<Models.Season> seasons){
        Models.LibraryEntry e=entry(media); List<Models.Episode> all=flatten(seasons); int index=indexOf(all,episode);e.state="progress";e.nextSeason=episode.season;e.nextEpisode=episode.number;
        if(index>0){Models.Episode prior=all.get(index-1);e.watchedSeason=prior.season;e.watchedEpisode=prior.number;}else{e.watchedSeason=null;e.watchedEpisode=null;} e.completedEpisodeCount=Math.max(0,index);e.liked=null;persist();
    }
    void unwatchSeason(Models.Media media,Models.Season season,List<Models.Season> seasons){if(season.episodes.isEmpty())return;unwatchEpisode(media,season.episodes.get(0),seasons);}
    boolean episodeWatched(Models.LibraryEntry e,Models.Episode ep,List<Models.Season> seasons){ if(e==null||e.watchedSeason==null)return false; List<Models.Episode> all=flatten(seasons); return indexOf(all,ep)<=indexOf(all,e.watchedSeason,e.watchedEpisode)&&indexOf(all,ep)>=0; }
    void completeSeries(Models.Media media,List<Models.Season> seasons,boolean liked){ Models.LibraryEntry e=entry(media);List<Models.Episode> all=flatten(seasons);e.state="watched";e.liked=liked;e.completedEpisodeCount=all.size();if(!all.isEmpty()){Models.Episode last=all.get(all.size()-1);e.watchedSeason=last.season;e.watchedEpisode=last.number;}persist(); }
    void completeSeason(Models.Media media,Models.Season season,List<Models.Season> seasons,Boolean liked){ Models.LibraryEntry e=entry(media); List<Models.Episode> all=flatten(seasons); if(season.episodes.isEmpty()) return; Models.Episode last=season.episodes.get(season.episodes.size()-1); int index=indexOf(all,last); if(index<0)return; if(index+1>=all.size()&&liked==null&&e.liked==null)throw new IllegalArgumentException("A reaction is required to finish a series"); e.watchedSeason=last.season; e.watchedEpisode=last.number; e.completedEpisodeCount=Math.max(e.completedEpisodeCount,index+1); if(index+1<all.size()){ Models.Episode next=all.get(index+1); e.state="progress"; e.nextSeason=next.season; e.nextEpisode=next.number; } else {e.state="watched";if(liked!=null)e.liked=liked;} persist(); }
    boolean reopenForNewEpisodes(Models.Media media,List<Models.Season> seasons){Models.LibraryEntry e=entries.get(media.id);if(e==null||!"watched".equals(e.state)||e.completedEpisodeCount<=0)return false;List<Models.Episode> all=flatten(seasons);int total=all.isEmpty()?seasons.stream().mapToInt(s->s.episodeCount).sum():all.size();if(total<=e.completedEpisodeCount)return false;Models.Episode next=all.isEmpty()?episodeAt(seasons,e.completedEpisodeCount):all.get(e.completedEpisodeCount);Models.Episode previous=all.isEmpty()?episodeAt(seasons,e.completedEpisodeCount-1):all.get(e.completedEpisodeCount-1);if(next==null||previous==null)return false;e.state="progress";e.nextSeason=next.season;e.nextEpisode=next.number;e.watchedSeason=previous.season;e.watchedEpisode=previous.number;persist();return true;}
    void advanceFallback(Models.Media media){Models.LibraryEntry e=entry(media);e.state="progress";e.watchedSeason=e.nextSeason;e.watchedEpisode=e.nextEpisode;e.nextEpisode++;persist();}
    List<String> preferredGenres(){ return Models.strings(jsonArray(prefs.getString("genres","[]"))); }
    void toggleGenre(String id){ List<String> g=preferredGenres();if(g.contains(id))g.remove(id);else g.add(id);prefs.edit().putString("genres",new JSONArray(g).toString()).apply(); }
    String themeMode(){return prefs.getString("theme-mode","system");}
    void setThemeMode(String mode){prefs.edit().putString("theme-mode",mode).apply();}
    boolean hideShowCredits(){return hideShowCredits(context);}
    void setHideShowCredits(boolean hide){prefs.edit().putBoolean("hide-show-credits",hide).apply();}
    /** Filmographies skip talk shows, reality and appearances as oneself unless the user turns it off. */
    static boolean hideShowCredits(Context c){return c.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE).getBoolean("hide-show-credits",true);}
    boolean libraryGridView(String section){return prefs.getBoolean("library-grid-"+section,false);}
    void setLibraryGridView(String section,boolean grid){prefs.edit().putBoolean("library-grid-"+section,grid).apply();}
    boolean onboardingDone(){return prefs.getBoolean("onboarding-done",false);}
    void setOnboardingDone(){prefs.edit().putBoolean("onboarding-done",true).apply();}
    void resetOnboarding(){prefs.edit().putBoolean("onboarding-done",false).apply();}
    String exportJson(){
        JSONObject root=new JSONObject();
        try{
            JSONArray library=new JSONArray(); for(Models.LibraryEntry e:entries.values())library.put(e.json());
            root.put("format","streamwise-backup"); root.put("version",1); root.put("exportedAt",new Date().toString());
            root.put("library",library); root.put("genres",new JSONArray(preferredGenres())); root.put("subscriptions",new JSONArray(subscriptions())); root.put("follows",ReleaseFollows.exportJson(context)); root.put("followedPeople",PersonFollows.exportJson(context));
        }catch(Exception ignored){}
        try{return root.toString(2);}catch(Exception ignored){return root.toString();}
    }
    boolean importJson(String json){
        try{
            JSONObject root=new JSONObject(json); JSONArray library=root.optJSONArray("library"); if(library==null)return false;
            entries.clear();
            for(int i=0;i<library.length();i++){Models.LibraryEntry e=Models.LibraryEntry.from(library.optJSONObject(i));if(e.media!=null&&!e.media.id.isEmpty())entries.put(e.media.id,e);}
            JSONArray genres=root.optJSONArray("genres");
            prefs.edit().putString("genres",genres==null?"[]":genres.toString()).putBoolean("onboarding-done",true).apply();
            if(root.has("subscriptions"))setSubscriptions(subscriptionIds(String.valueOf(root.opt("subscriptions"))));
            JSONArray follows=root.optJSONArray("follows");if(follows!=null)ReleaseFollows.importJson(context,follows);
            JSONArray people=root.optJSONArray("followedPeople");if(people!=null)PersonFollows.importJson(context,people);
            persist(); return true;
        }catch(Exception ignored){return false;}
    }
    private Models.LibraryEntry entry(Models.Media m){ Models.LibraryEntry e=entries.get(m.id);if(e==null){e=new Models.LibraryEntry();entries.put(m.id,e);}e.media=m;return e; }
    void reload(){entries.clear();load();}
    private void load(){ JSONArray a=jsonArray(prefs.getString("library","[]"));for(int i=0;i<a.length();i++){Models.LibraryEntry e=Models.LibraryEntry.from(a.optJSONObject(i));if(e.media!=null&&!e.media.id.isEmpty())entries.put(e.media.id,e);} }
    private void persist(){ JSONArray a=new JSONArray();for(Models.LibraryEntry e:entries.values())a.put(e.json());prefs.edit().putString("library",a.toString()).apply(); EpisodesWidget.updateAll(context); }
    private JSONArray jsonArray(String s){try{return new JSONArray(s);}catch(Exception e){return new JSONArray();}}
    static List<Models.Episode> flatten(List<Models.Season> seasons){List<Models.Episode> out=new ArrayList<>();for(Models.Season s:seasons)out.addAll(s.episodes);return out;}
    private Models.Episode episodeAt(List<Models.Season> seasons,int index){for(Models.Season s:seasons){if(index<s.episodeCount){Models.Episode e=new Models.Episode();e.season=s.number;e.number=index+1;return e;}index-=s.episodeCount;}return null;}
    private int indexOf(List<Models.Episode> all,Models.Episode e){return indexOf(all,e.season,e.number);}
    private int indexOf(List<Models.Episode> all,int s,int n){for(int i=0;i<all.size();i++)if(all.get(i).season==s&&all.get(i).number==n)return i;return -1;}
}
