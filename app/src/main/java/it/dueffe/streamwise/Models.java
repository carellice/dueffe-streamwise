package it.dueffe.streamwise;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

final class Models {
    static final class Provider {
        int id; String name = ""; String logo = ""; String kind = "";
        JSONObject json() { JSONObject o=new JSONObject(); put(o,"id",id); put(o,"name",name); put(o,"logo",logo); put(o,"kind",kind); return o; }
        static Provider from(JSONObject o) { Provider p=new Provider(); p.id=o.optInt("id"); p.name=o.optString("name"); p.logo=o.optString("logo"); p.kind=o.optString("kind"); return p; }
    }

    static final class Person {
        int id; String name="", character="", profile=""; boolean director; List<Media> knownFor=new ArrayList<>();
        JSONObject json(){JSONObject o=new JSONObject();put(o,"id",id);put(o,"name",name);put(o,"profile",profile);put(o,"director",director);return o;}
        static Person from(JSONObject o){Person p=new Person();p.id=o.optInt("id");p.name=o.optString("name");p.profile=o.optString("profile");p.director=o.optBoolean("director");return p;}
    }

    static final class Episode {
        int season, number, runtime; String name="", overview="", still="";
    }

    static final class Season {
        int number, episodeCount; String name=""; List<Episode> episodes=new ArrayList<>();
    }

    static final class Media {
        int tmdbId, collectionId; String id="", mediaType="movie", title="", originalTitle="", year="S.D.", releaseDate="", overview="Trama non disponibile.", collectionName="";
        String poster="", backdrop="", providerLink="", trailerUrl="", tagline="", country="", language=""; double rating; int runtime, episodeRuntime;
        List<String> backdrops=new ArrayList<>();
        List<String> genres=new ArrayList<>(); List<Integer> genreIds=new ArrayList<>();
        List<Provider> flatrate=new ArrayList<>(), rent=new ArrayList<>(), buy=new ArrayList<>();
        List<Person> cast=new ArrayList<>(), directors=new ArrayList<>();

        boolean isSeries() { return "tv".equals(mediaType); }
        String image() { return backdrop.isEmpty() ? poster : backdrop; }
        JSONObject json() {
            JSONObject o=new JSONObject(); put(o,"tmdbId",tmdbId); put(o,"id",id); put(o,"mediaType",mediaType); put(o,"title",title); put(o,"originalTitle",originalTitle);
            put(o,"year",year); put(o,"releaseDate",releaseDate); put(o,"overview",overview); put(o,"poster",poster); put(o,"backdrop",backdrop);
            put(o,"providerLink",providerLink); put(o,"trailerUrl",trailerUrl); put(o,"tagline",tagline); put(o,"country",country); put(o,"language",language); put(o,"rating",rating); put(o,"runtime",runtime); put(o,"episodeRuntime",episodeRuntime); put(o,"collectionId",collectionId); put(o,"collectionName",collectionName);
            put(o,"genres",new JSONArray(genres)); put(o,"genreIds",new JSONArray(genreIds)); put(o,"backdrops",new JSONArray(backdrops)); put(o,"flatrate",providersJson(flatrate));
            JSONArray regia=new JSONArray();for(Person p:directors)regia.put(p.json());put(o,"directors",regia);
            put(o,"rent",providersJson(rent)); put(o,"buy",providersJson(buy)); return o;
        }
        static Media from(JSONObject o) {
            Media m=new Media(); m.tmdbId=o.optInt("tmdbId"); m.id=o.optString("id"); m.mediaType=o.optString("mediaType","movie");
            m.title=o.optString("title");m.originalTitle=o.optString("originalTitle"); m.year=o.optString("year","S.D."); m.releaseDate=o.optString("releaseDate"); m.overview=o.optString("overview","Trama non disponibile.");
            m.poster=o.optString("poster"); m.backdrop=o.optString("backdrop"); m.providerLink=o.optString("providerLink");m.trailerUrl=o.optString("trailerUrl");m.tagline=o.optString("tagline");m.country=o.optString("country");m.language=o.optString("language"); m.rating=o.optDouble("rating");
            m.runtime=o.optInt("runtime"); m.episodeRuntime=o.optInt("episodeRuntime"); m.genres=strings(o.optJSONArray("genres")); m.genreIds=ints(o.optJSONArray("genreIds"));
            m.collectionId=o.optInt("collectionId");m.collectionName=o.optString("collectionName");m.backdrops=strings(o.optJSONArray("backdrops"));m.flatrate=providers(o.optJSONArray("flatrate")); m.rent=providers(o.optJSONArray("rent")); m.buy=providers(o.optJSONArray("buy"));JSONArray regia=o.optJSONArray("directors");if(regia!=null)for(int i=0;i<regia.length();i++){JSONObject person=regia.optJSONObject(i);if(person!=null)m.directors.add(Person.from(person));} return m;
        }
    }

    static final class LibraryEntry {
        Media media; String state="saved"; int nextSeason=1,nextEpisode=1; Integer watchedSeason=null,watchedEpisode=null; int completedEpisodeCount; Boolean liked=null; boolean pinned=false;
        JSONObject json() { JSONObject o=new JSONObject(); put(o,"media",media.json()); put(o,"state",state); put(o,"nextSeason",nextSeason); put(o,"nextEpisode",nextEpisode); if(watchedSeason!=null)put(o,"watchedSeason",watchedSeason); if(watchedEpisode!=null)put(o,"watchedEpisode",watchedEpisode); put(o,"completedEpisodeCount",completedEpisodeCount); put(o,"liked",liked); put(o,"pinned",pinned); return o; }
        static LibraryEntry from(JSONObject o) { LibraryEntry e=new LibraryEntry(); e.media=Media.from(o.optJSONObject("media")!=null?o.optJSONObject("media"):new JSONObject()); e.state=o.optString("state","saved"); e.nextSeason=o.optInt("nextSeason",1); e.nextEpisode=o.optInt("nextEpisode",1); if(o.has("watchedSeason"))e.watchedSeason=o.optInt("watchedSeason"); if(o.has("watchedEpisode"))e.watchedEpisode=o.optInt("watchedEpisode"); e.completedEpisodeCount=o.optInt("completedEpisodeCount"); if(o.has("liked")&&!o.isNull("liked"))e.liked=o.optBoolean("liked");e.pinned=o.optBoolean("pinned",false); return e; }
    }

    static JSONArray providersJson(List<Provider> list){ JSONArray a=new JSONArray(); for(Provider p:list)a.put(p.json()); return a; }
    static List<Provider> providers(JSONArray a){ List<Provider> r=new ArrayList<>(); if(a!=null)for(int i=0;i<a.length();i++)r.add(Provider.from(a.optJSONObject(i))); return r; }
    static List<String> strings(JSONArray a){ List<String> r=new ArrayList<>(); if(a!=null)for(int i=0;i<a.length();i++)r.add(a.optString(i)); return r; }
    static List<Integer> ints(JSONArray a){ List<Integer> r=new ArrayList<>(); if(a!=null)for(int i=0;i<a.length();i++)r.add(a.optInt(i)); return r; }
    static void put(JSONObject o,String k,Object v){ try{o.put(k,v);}catch(Exception ignored){} }
}
