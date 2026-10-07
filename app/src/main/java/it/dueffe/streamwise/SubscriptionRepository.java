package it.dueffe.streamwise;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
import java.util.*;

/** Watch-provider snapshots and count-based recommendations, restricted to Italian subscriptions. */
final class SubscriptionRepository {
    private static final long MAX_AGE=24*60*60*1000L;
    static final class Availability {
        final List<Models.Provider> providers;final long checkedAt;final boolean failed,verified;
        Availability(List<Models.Provider> providers,long checkedAt,boolean failed,boolean verified){this.providers=providers;this.checkedAt=checkedAt;this.failed=failed;this.verified=verified;}
        boolean fresh(){long age=System.currentTimeMillis()-checkedAt;return verified&&age>=0&&age<MAX_AGE;}
    }
    static int serviceId(int id){return id==1796?8:id==2100?119:id;}
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("streamwise-subscriptions",Context.MODE_PRIVATE);}
    static List<Models.Provider> savedServices(Context c){
        try{return Models.providers(new JSONArray(prefs(c).getString("_services","[]")));}catch(Exception ignored){return new ArrayList<>();}
    }
    static synchronized void saveServices(Context c,List<Models.Provider> services){
        Map<Integer,Models.Provider> known=new LinkedHashMap<>();for(Models.Provider p:savedServices(c))known.put(p.id,p);
        for(Models.Provider p:services)if(p.id==serviceId(p.id))known.put(p.id,p);
        prefs(c).edit().putString("_services",Models.providersJson(new ArrayList<>(known.values())).toString()).apply();
    }
    static Availability cached(Context c,Models.Media media){
        try{JSONObject record=new JSONObject(prefs(c).getString(media.id,""));
            return new Availability(Models.providers(record.optJSONArray("providers")),record.optLong("checkedAt"),false,true);
        }catch(Exception ignored){return new Availability(new ArrayList<>(media.flatrate),0,false,false);}
    }
    static Availability load(Context c,TmdbApi api,Models.Media media,boolean force){
        Availability cache=cached(c,media);if(!force&&cache.fresh())return cache;
        try{
            List<Models.Provider> providers=api.subscriptionAvailability(media);saveServices(c,providers);long checkedAt=System.currentTimeMillis();
            JSONObject record=new JSONObject().put("checkedAt",checkedAt).put("providers",Models.providersJson(providers));
            prefs(c).edit().putString(media.id,record.toString()).apply();return new Availability(providers,checkedAt,false,true);
        }catch(Exception ignored){return new Availability(cache.providers,cache.checkedAt,true,cache.verified);}
    }
    static List<Models.Provider> defaults(){
        List<Models.Provider> out=new ArrayList<>();
        for(TmdbApi.Platform platform:TmdbApi.PLATFORMS){Models.Provider p=new Models.Provider();p.id=platform.providerId;p.name=platform.label;p.kind="flatrate";out.add(p);}
        int[] ids={39,11,524,110,283,109};String[] names={"NOW","MUBI","discovery+","Infinity+","Crunchyroll","TIMVISION"};
        for(int i=0;i<ids.length;i++){Models.Provider p=new Models.Provider();p.id=ids[i];p.name=names[i];p.kind="flatrate";out.add(p);}return out;
    }
    static List<Models.Provider> services(List<Models.Provider> directory,Collection<Availability> snapshots){
        Map<Integer,Models.Provider> out=new LinkedHashMap<>();for(Models.Provider p:defaults())out.put(p.id,p);
        for(Models.Provider p:directory)out.put(serviceId(p.id),p);
        for(Availability snapshot:snapshots)for(Models.Provider p:snapshot.providers)if(!out.containsKey(serviceId(p.id)))out.put(serviceId(p.id),p);
        List<Models.Provider> services=new ArrayList<>(out.values());services.sort(Comparator.comparing(p->p.name.toLowerCase(Locale.ITALIAN)));return services;
    }
    static boolean included(Availability snapshot,Set<Integer> serviceIds){
        if(snapshot==null)return false;for(Models.Provider p:snapshot.providers)if(serviceIds.contains(serviceId(p.id)))return true;return false;
    }
    static final class Rank {
        final Models.Provider provider;int saved,progress,additional;
        Rank(Models.Provider provider){this.provider=provider;}
        int total(){return saved+progress;}
    }
    static List<Rank> rank(Collection<Models.LibraryEntry> entries,Map<String,Availability> snapshots,List<Models.Provider> services,Set<Integer> active){
        Map<String,Models.LibraryEntry> unique=new LinkedHashMap<>();for(Models.LibraryEntry e:entries)if("saved".equals(e.state)||"progress".equals(e.state))unique.put(e.media.id,e);
        List<Rank> result=new ArrayList<>();
        for(Models.Provider service:services){Rank rank=new Rank(service);Set<Integer> selected=Collections.singleton(serviceId(service.id));
            for(Models.LibraryEntry entry:unique.values()){
                Availability availability=snapshots.get(entry.media.id);if(!included(availability,selected))continue;
                if("saved".equals(entry.state))rank.saved++;else rank.progress++;
                if(!included(availability,active))rank.additional++;
            }result.add(rank);
        }
        result.sort(Comparator.comparingInt(Rank::total).reversed().thenComparing(r->r.provider.name.toLowerCase(Locale.ITALIAN)));return result;
    }
}
