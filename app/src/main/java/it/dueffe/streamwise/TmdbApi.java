package it.dueffe.streamwise;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

final class TmdbApi {
    private static final String BASE="https://api.themoviedb.org/3";
    private static final Map<Integer,String> MOVIE_GENRES=new HashMap<>(),TV_GENRES=new HashMap<>();
    static { putGenres(MOVIE_GENRES,new Object[][]{{12,"Avventura"},{14,"Fantasy"},{16,"Animazione"},{18,"Dramma"},{27,"Horror"},{28,"Azione"},{35,"Commedia"},{36,"Storia"},{53,"Thriller"},{80,"Crime"},{99,"Documentario"},{878,"Fantascienza"},{9648,"Mistero"},{10402,"Musica"},{10749,"Romance"},{10751,"Famiglia"},{10752,"Guerra"}}); putGenres(TV_GENRES,new Object[][]{{16,"Animazione"},{18,"Dramma"},{35,"Commedia"},{80,"Crime"},{99,"Documentario"},{9648,"Mistero"},{10751,"Famiglia"},{10759,"Azione e avventura"},{10762,"Kids"},{10764,"Reality"},{10765,"Sci-fi e fantasy"},{10767,"Talk"},{10768,"Guerra e politica"}}); }
    static final class Genre { final String id,label; final int movie,tv; Genre(String id,String label,int movie,int tv){this.id=id;this.label=label;this.movie=movie;this.tv=tv;} int value(String type){return "tv".equals(type)?tv:movie;} }
    static final List<Genre> GENRES=java.util.Arrays.asList(new Genre("action","Azione",28,10759),new Genre("comedy","Commedia",35,35),new Genre("drama","Dramma",18,18),new Genre("thriller","Thriller / crime",53,80),new Genre("sci-fi","Sci-fi / fantasy",878,10765),new Genre("horror","Horror",27,0),new Genre("documentary","Documentario",99,99),new Genre("erotic","Erotico",-1,-1));
    static final class Platform { final String id,label; final int providerId; Platform(String id,String label,int providerId){this.id=id;this.label=label;this.providerId=providerId;} }
    static final List<Platform> PLATFORMS=java.util.Arrays.asList(new Platform("netflix","Netflix",8),new Platform("prime-video","Prime Video",119),new Platform("apple-tv-plus","Apple TV+",350),new Platform("disney-plus","Disney+",337),new Platform("paramount-plus","Paramount+",531),new Platform("max","HBO Max",1899));
    interface RequestClient { JSONObject get(String path,Map<String,String> params) throws Exception; }
    private RequestClient requestClient;
    TmdbApi(RequestClient client){this("");requestClient=client;}
    private final String key;
    private String eroticKeywordIds;
    private String horrorKeywordId;
    private String trueStoryKeywordIds;
    private String apocalypticKeywordIds;
    private String trueCrimeKeywordIds;
    private String halloweenKeywordIds;
    private String christmasKeywordIds;
    private int timeout = 12000;
    TmdbApi(String key, int timeout){this(key);this.timeout=timeout;}
    TmdbApi(String key){this.key=key==null?"":key.trim();}
    boolean configured(){return !key.isEmpty();}

    List<Models.Media> discover(String type,int page,Integer genre,Integer provider,String sort) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("watch_region","IT");q.put("region","IT");q.put("include_adult","false");q.put("with_watch_monetization_types","flatrate|rent|buy");
        if(genre!=null&&genre>0)q.put("with_genres",String.valueOf(genre));
        if(genre!=null&&genre==-1){q.put("include_adult","true");String ids=eroticKeywordIds();if(ids.isEmpty())return new ArrayList<>();q.put("with_keywords",ids);}
        if(provider!=null&&provider>0)q.put("with_watch_providers",String.valueOf(provider));
        q.put("sort_by","recent".equals(sort)?("tv".equals(type)?"first_air_date.desc":"primary_release_date.desc"):"popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    static final class ReleasePage {
        final List<Models.Media> media;final boolean hasMore;final int nextPage;
        ReleasePage(List<Models.Media> media,boolean hasMore,int nextPage){this.media=media;this.hasMore=hasMore;this.nextPage=nextPage;}
    }
    List<Models.Media> newReleases(String type,int page,boolean upcoming) throws Exception{return newReleasesPage(type,page,upcoming).media;}
    ReleasePage newReleasesPage(String type,int page,boolean upcoming) throws Exception{
        return newReleasesPage(type,page,upcoming,java.util.Collections.emptySet());
    }
    ReleasePage newReleasesPage(String type,int page,boolean upcoming,Set<String> excluded) throws Exception{
        java.time.LocalDate today=java.time.LocalDate.now(TvGuideRepository.ROME);
        java.time.LocalDate from=upcoming?today.plusDays(1):today.minusDays(60),to=upcoming?today.plusDays(60):today;
        Map<String,String> q=new LinkedHashMap<>();q.put("include_adult","false");
        String prefix="tv".equals(type)?"first_air_date":"release_date";
        q.put(prefix+".gte",from.toString());q.put(prefix+".lte",to.toString());
        q.put("sort_by","popularity.desc");
        if("movie".equals(type)){q.put("region","IT");q.put("with_release_type","3|2|4|5|6");}
        else{q.put("include_null_first_air_dates","false");q.put("timezone","Europe/Rome");q.put("with_type","2|4");}
        // Merge a dedicated Italian-production search with the regional catalog so
        // local titles are not buried beneath worldwide popularity rankings.
        Map<String,String> local=new LinkedHashMap<>(q);local.put("with_origin_country","IT");
        if("tv".equals(type)){q.put("watch_region","IT");q.put("with_watch_monetization_types","flatrate|free|ads|rent|buy");}
        List<Models.Media> media=new ArrayList<>();boolean hasMore=true;int cursor=Math.max(1,page);
        java.util.concurrent.ExecutorService executor=java.util.concurrent.Executors.newFixedThreadPool(4);
        try{
            // Consume sparse raw pages until there are usable results. The cursor
            // records every consumed page, including those rejected by validation.
            do{
                List<Models.Media> candidates=new ArrayList<>();boolean more=false;
                for(Map<String,String> source:java.util.Arrays.asList(local,q)){
                    source.put("page",String.valueOf(cursor));JSONObject response=get("/discover/"+type,source);
                    candidates.addAll(mediaList(response.optJSONArray("results"),type,20));
                    more|=cursor<Math.min(500,response.optInt("total_pages"));
                }
                List<CompletableFuture<Models.Media>> requests=new ArrayList<>();
                for(Models.Media item:unique(candidates))if(!excluded.contains(item.id))requests.add(CompletableFuture.supplyAsync(()->{
                    try{
                        if(!readableLocalizedTitle(item.title))return null;
                        if("movie".equals(type)){
                            item.releaseDate=italianReleaseDate(get("/movie/"+item.tmdbId+"/release_dates",null),from,to);
                            if(item.releaseDate.isEmpty())return null;
                            item.year=item.releaseDate.substring(0,4);
                        }else{
                            Map<String,String> params=new LinkedHashMap<>();params.put("append_to_response","watch/providers");
                            JSONObject detail=get("/tv/"+item.tmdbId,params);
                            if(!availableInItaly(detail))return null;
                        }
                        return item;
                    }catch(Exception e){throw new java.util.concurrent.CompletionException(e);}
                },executor));
                for(CompletableFuture<Models.Media> request:requests){Models.Media item=request.join();if(item!=null)media.add(item);}
                media=unique(media);cursor++;hasMore=more;
            }while(media.size()<20&&hasMore&&!Thread.currentThread().isInterrupted());
        }finally{executor.shutdownNow();}
        if(upcoming)media.sort(java.util.Comparator.comparing(m->m.releaseDate));
        return new ReleasePage(media,hasMore,cursor);
    }
    static boolean availableInItaly(JSONObject detail){
        JSONObject watch=detail.optJSONObject("watch/providers");
        JSONObject results=watch==null?null:watch.optJSONObject("results");
        JSONObject italy=results==null?null:results.optJSONObject("IT");
        if(italy!=null)for(String kind:new String[]{"flatrate","free","ads","rent","buy"}){
            JSONArray providers=italy.optJSONArray(kind);if(providers!=null&&providers.length()>0)return true;
        }
        // Domestic broadcasters also cover series on Italian television, even
        // when JustWatch has not yet indexed their free catch-up catalog.
        JSONArray networks=detail.optJSONArray("networks");
        if(networks!=null)for(int i=0;i<networks.length();i++){
            JSONObject network=networks.optJSONObject(i);
            if(network!=null&&"IT".equals(network.optString("origin_country")))return true;
        }
        return false;
    }
    static boolean readableLocalizedTitle(String title){
        if(title==null||title.trim().isEmpty()||"Titolo senza nome".equals(title))return false;
        boolean readable=false;
        for(int offset=0;offset<title.length();){
            int cp=title.codePointAt(offset);offset+=Character.charCount(cp);
            if(Character.isLetter(cp)){
                if(Character.UnicodeScript.of(cp)!=Character.UnicodeScript.LATIN)return false;
                readable=true;
            }
            if(cp>='0'&&cp<='9')readable=true;
        }return readable;
    }
    static String italianReleaseDate(JSONObject response,java.time.LocalDate from,java.time.LocalDate to){
        JSONArray countries=response.optJSONArray("results");
        if(countries!=null)for(int i=0;i<countries.length();i++){
            JSONObject country=countries.optJSONObject(i);if(country==null||!"IT".equals(country.optString("iso_3166_1")))continue;
            JSONArray dates=country.optJSONArray("release_dates");if(dates==null)continue;
            for(int type:new int[]{3,2,4,5,6}){
                String chosen="";
                for(int j=0;j<dates.length();j++){
                    JSONObject entry=dates.optJSONObject(j);if(entry==null||entry.optInt("type")!=type)continue;
                    String raw=entry.optString("release_date");
                    try{java.time.LocalDate date=java.time.LocalDate.parse(raw.substring(0,10));if(!date.isBefore(from)&&!date.isAfter(to)&&(chosen.isEmpty()||date.toString().compareTo(chosen)<0))chosen=date.toString();}catch(Exception ignored){}
                }
                if(!chosen.isEmpty())return chosen;
            }
        }return "";
    }
    List<Models.Media> discoverFiltered(String type,int page,List<Integer> genres,List<Integer> providers,boolean erotic) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("watch_region","IT");q.put("region","IT");q.put("include_adult",erotic?"true":"false");q.put("with_watch_monetization_types","flatrate|rent|buy");
        if(!genres.isEmpty())q.put("with_genres",joinIds(genres));
        if(!providers.isEmpty())q.put("with_watch_providers",joinIds(providers));
        if(erotic){String ids=eroticKeywordIds();if(ids.isEmpty())return new ArrayList<>();q.put("with_keywords",ids);}
        q.put("sort_by","popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    List<Models.Media> horrorSeries(int page,List<Integer> providers) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("watch_region","IT");q.put("region","IT");q.put("include_adult","false");q.put("with_watch_monetization_types","flatrate|rent|buy");q.put("sort_by","popularity.desc");
        if(!providers.isEmpty())q.put("with_watch_providers",joinIds(providers));
        String keyword=horrorKeywordId();if(keyword.isEmpty())return new ArrayList<>();q.put("with_keywords",keyword);
        return mediaList(get("/discover/tv",q).optJSONArray("results"),"tv",18);
    }
    List<Models.Media> trueStories(String type,int page) throws Exception{
        String ids=trueStoryKeywordIds();if(ids.isEmpty())return new ArrayList<>();
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("include_adult","false");q.put("with_keywords",ids);q.put("sort_by","popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    List<Models.Media> apocalyptic(String type,int page) throws Exception{
        String ids=apocalypticKeywordIds();if(ids.isEmpty())return new ArrayList<>();
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("include_adult","false");q.put("with_keywords",ids);q.put("sort_by","popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    List<Models.Media> trueCrime(String type,int page) throws Exception{
        String ids=trueCrimeKeywordIds();if(ids.isEmpty())return new ArrayList<>();
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("include_adult","false");q.put("with_keywords",ids);q.put("sort_by","popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    /** Seasonal picks: "halloween" or "christmas" themed titles, most popular first. */
    List<Models.Media> holiday(String holiday,String type,int page) throws Exception{
        String ids="halloween".equals(holiday)?halloweenKeywordIds():christmasKeywordIds();if(ids.isEmpty())return new ArrayList<>();
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));q.put("include_adult","false");q.put("with_keywords",ids);q.put("sort_by","popularity.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    private synchronized String halloweenKeywordIds() throws Exception{
        if(halloweenKeywordIds!=null)return halloweenKeywordIds;
        halloweenKeywordIds=findKeywordIds("halloween","trick or treating","jack-o'-lantern","halloween party");
        return halloweenKeywordIds;
    }
    private synchronized String christmasKeywordIds() throws Exception{
        if(christmasKeywordIds!=null)return christmasKeywordIds;
        christmasKeywordIds=findKeywordIds("christmas","christmas eve","santa claus","christmas party","christmas tree");
        return christmasKeywordIds;
    }
    List<Models.Provider> subscriptionAvailability(Models.Media media)throws Exception{
        JSONObject regions=get("/"+media.mediaType+"/"+media.tmdbId+"/watch/providers",null).optJSONObject("results");
        JSONObject italy=regions==null?null:regions.optJSONObject("IT");
        return providers(italy==null?null:italy.optJSONArray("flatrate"),"flatrate");
    }
    List<Models.Provider> subscriptionDirectory()throws Exception{
        Set<Integer> selected=new HashSet<>();for(Models.Provider p:SubscriptionRepository.defaults())selected.add(p.id);
        Map<Integer,Models.Provider> out=new LinkedHashMap<>();Map<String,String> q=new LinkedHashMap<>();q.put("watch_region","IT");
        for(String type:new String[]{"movie","tv"}){
            JSONArray items=get("/watch/providers/"+type,q).optJSONArray("results");
            if(items!=null)for(int i=0;i<items.length();i++){
                JSONObject item=items.optJSONObject(i);if(item==null||!selected.contains(item.optInt("provider_id")))continue;
                Models.Provider p=new Models.Provider();p.id=item.optInt("provider_id");p.name=item.optString("provider_name");p.logo=image(item.optString("logo_path"),"w92");p.kind="flatrate";out.put(p.id,p);
            }
        }return new ArrayList<>(out.values());
    }
    Map<String,String> platformLogos() throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("watch_region","IT");
        JSONArray items=get("/watch/providers/movie",q).optJSONArray("results");Map<String,String> logos=new HashMap<>();
        if(items!=null)for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item==null)continue;int providerId=item.optInt("provider_id");for(Platform platform:PLATFORMS)if(platform.providerId==providerId)logos.put(platform.id,image(item.optString("logo_path"),"w92"));}
        return logos;
    }
    private String joinIds(List<Integer> ids){StringBuilder out=new StringBuilder();for(Integer id:ids){if(out.length()>0)out.append('|');out.append(id);}return out.toString();}
    private synchronized String horrorKeywordId() throws Exception{
        if(horrorKeywordId!=null)return horrorKeywordId;
        Map<String,String> q=new LinkedHashMap<>();q.put("query","horror");
        JSONArray keywords=get("/search/keyword",q).optJSONArray("results");
        if(keywords!=null)for(int i=0;i<keywords.length();i++){JSONObject item=keywords.optJSONObject(i);if(item!=null&&"horror".equalsIgnoreCase(item.optString("name"))){horrorKeywordId=String.valueOf(item.optInt("id"));return horrorKeywordId;}}
        horrorKeywordId="";return horrorKeywordId;
    }
    private synchronized String trueStoryKeywordIds() throws Exception{
        if(trueStoryKeywordIds!=null)return trueStoryKeywordIds;
        trueStoryKeywordIds=findKeywordIds("based on true story","based on a true story","based on true events","based on real events","inspired by true events","true story","biography","true crime","based on real person","autobiography");
        return trueStoryKeywordIds;
    }
    private synchronized String apocalypticKeywordIds() throws Exception{
        if(apocalypticKeywordIds!=null)return apocalypticKeywordIds;
        apocalypticKeywordIds=findKeywordIds("post-apocalyptic","apocalyptic","dystopia","end of the world","zombie apocalypse");
        return apocalypticKeywordIds;
    }
    private synchronized String trueCrimeKeywordIds() throws Exception{
        if(trueCrimeKeywordIds!=null&&!trueCrimeKeywordIds.isEmpty())return trueCrimeKeywordIds;
        trueCrimeKeywordIds=findKeywordIds("true crime");
        return trueCrimeKeywordIds;
    }
    private String findKeywordIds(String... terms){
        List<CompletableFuture<Integer>> requests=new ArrayList<>();
        for(String term:terms)requests.add(CompletableFuture.supplyAsync(()->{
            try{
                Map<String,String> q=new LinkedHashMap<>();q.put("query",term);
                JSONArray results=get("/search/keyword",q).optJSONArray("results");if(results==null)return 0;
                for(int i=0;i<results.length();i++){
                    JSONObject item=results.optJSONObject(i);
                    if(item!=null&&item.optString("name").equalsIgnoreCase(term)){int id=item.optInt("id");if(id>0)return id;break;}
                }
            }catch(Exception ignored){}
            return 0;
        }));
        Set<Integer> ids=new java.util.LinkedHashSet<>();
        for(CompletableFuture<Integer> request:requests)try{int id=request.join();if(id>0)ids.add(id);}catch(Exception ignored){}
        StringBuilder joined=new StringBuilder();for(Integer id:ids){if(joined.length()>0)joined.append('|');joined.append(id);}
        return joined.toString();
    }
    List<Models.Media> eroticDiscover(String type,int page) throws Exception{
        return unique(discover(type,page,-1,null,"popular"));
    }
    List<Models.Media> trending(String type) throws Exception{return mediaList(get("/trending/"+type+"/week",null).optJSONArray("results"),type,10);}
    List<Models.Media> featured(String type) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page","1");
        if("tv".equals(type))q.put("timezone","Europe/Rome");else q.put("region","IT");
        String path="tv".equals(type)?"/tv/on_the_air":"/movie/now_playing";
        return mediaList(get(path,q).optJSONArray("results"),type,20);
    }
    List<Models.Media> masterpieces(String type,int page) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();
        q.put("page",String.valueOf(page));
        q.put("watch_region","IT");q.put("region","IT");q.put("include_adult","false");
        q.put("with_watch_monetization_types","flatrate|rent|buy");
        q.put("vote_average.gte","8.0");q.put("vote_count.gte","tv".equals(type)?"100":"300");
        q.put("sort_by","vote_average.desc");
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,18);
    }
    List<Models.Media> related(Models.Media media) throws Exception{return related(media,1);}
    List<Models.Media> related(Models.Media media,int page) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));
        List<Models.Media> out=mediaList(get("/"+media.mediaType+"/"+media.tmdbId+"/recommendations",q).optJSONArray("results"),media.mediaType,20);
        if(out.isEmpty())out=mediaList(get("/"+media.mediaType+"/"+media.tmdbId+"/similar",q).optJSONArray("results"),media.mediaType,20);
        return out;
    }
    List<Models.Media> saga(Models.Media media) throws Exception{
        List<Models.Media> out=new ArrayList<>();if(media.collectionId<=0)return out;
        JSONObject collection=get("/collection/"+media.collectionId,null);
        out=mediaList(collection.optJSONArray("parts"),"movie",50);
        String collectionName=collection.optString("name",media.collectionName);
        for(Models.Media item:out){item.collectionId=media.collectionId;item.collectionName=collectionName;}
        out.removeIf(item->item.tmdbId==media.tmdbId);
        out.sort((a,b)->{if(a.releaseDate.isEmpty()&&!b.releaseDate.isEmpty())return 1;if(!a.releaseDate.isEmpty()&&b.releaseDate.isEmpty())return -1;return a.releaseDate.compareTo(b.releaseDate);});
        return unique(out);
    }
    List<Models.Media> recommendations(Models.Media media,int page) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("page",String.valueOf(page));
        List<Models.Media> out=mediaList(get("/"+media.mediaType+"/"+media.tmdbId+"/recommendations",q).optJSONArray("results"),media.mediaType,20);
        if(out.isEmpty())out=mediaList(get("/"+media.mediaType+"/"+media.tmdbId+"/similar",q).optJSONArray("results"),media.mediaType,20);
        return out;
    }
    /** /discover with any filters, for the AI's candidates (AiAdvisor.kt). */
    List<Models.Media> discoverQuery(String type,Map<String,String> filters) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("include_adult","false");q.put("watch_region","IT");q.put("region","IT");q.putAll(filters);
        return mediaList(get("/discover/"+type,q).optJSONArray("results"),type,20);
    }
    List<Models.Media> similar(Models.Media media) throws Exception{
        return mediaList(get("/"+media.mediaType+"/"+media.tmdbId+"/similar",null).optJSONArray("results"),media.mediaType,20);
    }
    List<Models.Media> searchTitles(String query,Integer year) throws Exception{
        List<Models.Media> out=new ArrayList<>();Map<String,String> q=new LinkedHashMap<>();q.put("query",query);q.put("include_adult","false");q.put("region","IT");
        for(String type:java.util.Arrays.asList("movie","tv")){for(Models.Media m:mediaList(get("/search/"+type,q).optJSONArray("results"),type,40))if(year==null||String.valueOf(year).equals(m.year))out.add(m);}
        if(out.size()<5&&query.trim().length()>=4){
            for(String alternate:fuzzyQueries(query)){
                Map<String,String> alt=new LinkedHashMap<>(q);alt.put("query",alternate);
                for(String type:java.util.Arrays.asList("movie","tv"))for(Models.Media m:mediaList(get("/search/"+type,alt).optJSONArray("results"),type,20))if(year==null||String.valueOf(year).equals(m.year))out.add(m);
            }
        }
        final String needle=query.trim().toLowerCase(java.util.Locale.ROOT);
        out.sort((a,b)->{
            int relevanceA=titleRelevance(a.title,needle),relevanceB=titleRelevance(b.title,needle);
            if(relevanceA==3)relevanceA=4+editDistance(a.title.toLowerCase(java.util.Locale.ROOT),needle);
            if(relevanceB==3)relevanceB=4+editDistance(b.title.toLowerCase(java.util.Locale.ROOT),needle);
            if(relevanceA!=relevanceB)return Integer.compare(relevanceA,relevanceB);
            return Double.compare(b.rating,a.rating);
        });return unique(out);
    }
    List<Models.Person> searchPeople(String query) throws Exception{return searchPeople(query,false);}
    List<Models.Person> searchPeople(String query,boolean directorsOnly) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("query",query);q.put("include_adult","false");JSONArray a=get("/search/person",q).optJSONArray("results");List<Models.Person> out=new ArrayList<>();
        if(a!=null)for(int i=0;i<Math.min(12,a.length());i++){
            JSONObject o=a.optJSONObject(i);if(o==null)continue;
            Models.Person p=creditPerson(o);p.director=directorsOnly;
            if(directorsOnly&&!"Directing".equals(o.optString("known_for_department"))){
                // Actors can also direct: use actual directing credits rather than department alone.
                try{if(personCredits(p.id,true).isEmpty())continue;}catch(Exception ignored){continue;}
            }
            JSONArray known=o.optJSONArray("known_for");if(known!=null)for(int k=0;k<Math.min(3,known.length());k++){JSONObject x=known.optJSONObject(k);if(x==null)continue;String type=x.optString("media_type");if("movie".equals(type)||"tv".equals(type))p.knownFor.add(mapMedia(x,type));}out.add(p);
        }return out;
    }
    List<Models.Media> personCredits(int personId) throws Exception{return personCredits(personId,false);}
    List<Models.Media> personCredits(int personId,boolean directedOnly) throws Exception{
        return mapPersonCredits(get("/person/"+personId+"/combined_credits",null),directedOnly);
    }
    List<Models.Media> personCredits(int personId,boolean directedOnly,boolean hideShows) throws Exception{
        return mapPersonCredits(personCreditsJson(personId),directedOnly,hideShows);
    }
    JSONObject personCreditsJson(int personId) throws Exception{return get("/person/"+personId+"/combined_credits",null);}
    List<Models.Media> mapPersonCredits(JSONObject credits,boolean directedOnly){return mapPersonCredits(credits,directedOnly,false);}
    List<Models.Media> mapPersonCredits(JSONObject credits,boolean directedOnly,boolean hideShows){
        JSONArray a=credits.optJSONArray(directedOnly?"crew":"cast");List<JSONObject> raw=new ArrayList<>();
        if(a!=null)for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&(!directedOnly||"Director".equals(o.optString("job")))&&!(hideShows&&isShowCredit(o)))raw.add(o);}
        raw.sort((x,y)->Double.compare(y.optDouble("popularity"),x.optDouble("popularity")));
        List<Models.Media> out=new ArrayList<>();for(JSONObject o:raw){String type=o.optString("media_type");if("movie".equals(type)||"tv".equals(type))out.add(mapMedia(o,type));}return unique(out);
    }
    private static final Set<Integer> SHOW_GENRES=new HashSet<>(java.util.Arrays.asList(10763,10764,10767));
    /** Talk shows, late shows, news, reality and appearances as oneself (award nights, interviews, guest spots). */
    static boolean isShowCredit(JSONObject o){
        JSONArray ids=o.optJSONArray("genre_ids");
        if("tv".equals(o.optString("media_type"))&&ids!=null)for(int i=0;i<ids.length();i++)if(SHOW_GENRES.contains(ids.optInt(i)))return true;
        String character=o.optString("character").trim().toLowerCase(Locale.ROOT);
        return character.matches("(self|himself|herself|themselves|themself|se stesso|se stessa|lui stesso|lei stessa)\\b.*")||character.matches(".*\\((self|himself|herself|voice\\s*-\\s*self)\\)|.*\\b(host|guest|presenter|musical guest)$");
    }
    static List<Models.Person> directors(JSONObject credits){
        Map<Integer,Models.Person> out=new LinkedHashMap<>();JSONArray crew=credits==null?null:credits.optJSONArray("crew");
        if(crew!=null)for(int i=0;i<crew.length();i++){
            JSONObject o=crew.optJSONObject(i);if(o==null)continue;
            boolean directed="Director".equals(o.optString("job"));JSONArray jobs=o.optJSONArray("jobs");
            if(jobs!=null)for(int j=0;j<jobs.length();j++){JSONObject job=jobs.optJSONObject(j);if(job!=null&&"Director".equals(job.optString("job")))directed=true;}
            if(directed&&o.optInt("id")>0){Models.Person p=creditPerson(o);p.director=true;out.putIfAbsent(p.id,p);}
        }return new ArrayList<>(out.values());
    }
    private static Models.Person creditPerson(JSONObject o){Models.Person p=new Models.Person();p.id=o.optInt("id");p.name=o.optString("name","Persona");p.profile=image(o.optString("profile_path"),"w185");return p;}
    Models.Media details(Models.Media base) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("append_to_response",base.isSeries()?"watch/providers,credits,aggregate_credits":"watch/providers,credits");JSONObject o=get("/"+base.mediaType+"/"+base.tmdbId,q);Models.Media m=mapMedia(o,base.mediaType);
        JSONObject it=o.optJSONObject("watch/providers");JSONObject results=it==null?null:it.optJSONObject("results");JSONObject region=results==null?null:results.optJSONObject("IT");if(region!=null){m.providerLink=region.optString("link");m.flatrate=providers(region.optJSONArray("flatrate"),"flatrate");m.rent=providers(region.optJSONArray("rent"),"rent");m.buy=providers(region.optJSONArray("buy"),"buy");}
        JSONObject credits=o.optJSONObject("credits");JSONArray cast=credits==null?null:credits.optJSONArray("cast");if(cast!=null)for(int i=0;i<cast.length();i++){JSONObject x=cast.optJSONObject(i);Models.Person p=new Models.Person();p.id=x.optInt("id");p.name=x.optString("name","Interprete");p.character=x.optString("character");p.profile=image(x.optString("profile_path"),"w185");m.cast.add(p);}m.directors=directors(o.optJSONObject(base.isSeries()?"aggregate_credits":"credits"));return m;
    }
    List<String> backdrops(Models.Media media) throws Exception{
        JSONObject o=get("/"+media.mediaType+"/"+media.tmdbId+"/images",null);JSONArray a=o.optJSONArray("backdrops");List<String> out=new ArrayList<>();
        if(a!=null)for(int i=0;i<Math.min(a.length(),30);i++){String path=a.optJSONObject(i).optString("file_path");if(path!=null&&!path.isEmpty())out.add(image(path,"w780"));}
        if(media.backdrop!=null&&!media.backdrop.isEmpty()&&!out.contains(media.backdrop))out.add(0,media.backdrop);
        return out;
    }
    /** Release state used by followed titles: episode schedule for series, Italian dates and streaming for films. */
    static final class ReleaseInfo {
        String status="",lastAirDate="",lastName="",nextAirDate="",nextName="",theatricalDate="",digitalDate="",fallbackDate="";
        int lastSeason,lastEpisode,nextSeason,nextEpisode;
        List<Models.Provider> streaming=new ArrayList<>();
        boolean ended(){return "Ended".equals(status)||"Canceled".equals(status);}
        boolean hasNext(){return nextSeason>0&&nextEpisode>0;}
    }
    ReleaseInfo releaseInfo(Models.Media media) throws Exception{
        Map<String,String> q=new LinkedHashMap<>();q.put("append_to_response",media.isSeries()?"watch/providers":"release_dates,watch/providers");
        return parseReleaseInfo(get("/"+media.mediaType+"/"+media.tmdbId,q),media.isSeries());
    }
    static ReleaseInfo parseReleaseInfo(JSONObject o,boolean series){
        ReleaseInfo info=new ReleaseInfo();info.status=o.optString("status");
        JSONObject watch=o.optJSONObject("watch/providers");JSONObject regions=watch==null?null:watch.optJSONObject("results");JSONObject italy=regions==null?null:regions.optJSONObject("IT");
        info.streaming=providers(italy==null?null:italy.optJSONArray("flatrate"),"flatrate");
        if(series){
            JSONObject last=o.optJSONObject("last_episode_to_air"),next=o.optJSONObject("next_episode_to_air");
            if(last!=null){info.lastSeason=last.optInt("season_number");info.lastEpisode=last.optInt("episode_number");info.lastAirDate=dateOnly(last.optString("air_date"));info.lastName=last.optString("name");}
            if(next!=null){info.nextSeason=next.optInt("season_number");info.nextEpisode=next.optInt("episode_number");info.nextAirDate=dateOnly(next.optString("air_date"));info.nextName=next.optString("name");}
            return info;
        }
        info.fallbackDate=dateOnly(o.optString("release_date"));
        JSONObject releases=o.optJSONObject("release_dates");JSONArray countries=releases==null?null:releases.optJSONArray("results");
        if(countries!=null)for(int i=0;i<countries.length();i++){
            JSONObject country=countries.optJSONObject(i);if(country==null||!"IT".equals(country.optString("iso_3166_1")))continue;
            JSONArray dates=country.optJSONArray("release_dates");if(dates==null)continue;
            for(int j=0;j<dates.length();j++){
                JSONObject entry=dates.optJSONObject(j);if(entry==null)continue;
                String date=dateOnly(entry.optString("release_date"));if(date.isEmpty())continue;int type=entry.optInt("type");
                if((type==2||type==3)&&(info.theatricalDate.isEmpty()||date.compareTo(info.theatricalDate)<0))info.theatricalDate=date;
                if(type==4&&(info.digitalDate.isEmpty()||date.compareTo(info.digitalDate)<0))info.digitalDate=date;
            }
        }
        return info;
    }
    private static String dateOnly(String raw){
        if(raw==null||raw.length()<10)return "";
        try{return java.time.LocalDate.parse(raw.substring(0,10)).toString();}catch(Exception e){return "";}
    }
    List<Models.Season> seasons(Models.Media media,boolean withEpisodes) throws Exception{
        JSONObject detail=get("/tv/"+media.tmdbId,null);JSONArray a=detail.optJSONArray("seasons");List<Models.Season> out=new ArrayList<>();if(a==null)return out;
        for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);int number=o.optInt("season_number");int count=o.optInt("episode_count");if(number<=0||count<=0)continue;Models.Season s=new Models.Season();s.number=number;s.name=o.optString("name","Stagione "+number);s.episodeCount=count;if(withEpisodes)s.episodes=episodes(media,number);out.add(s);}return out;
    }
    List<Models.Episode> episodes(Models.Media media,int season) throws Exception{
        JSONObject o=get("/tv/"+media.tmdbId+"/season/"+season,null);JSONArray a=o.optJSONArray("episodes");List<Models.Episode> out=new ArrayList<>();if(a!=null)for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);Models.Episode e=new Models.Episode();e.season=season;e.number=x.optInt("episode_number");e.name=x.optString("name","Episodio "+e.number);e.overview=x.optString("overview");e.runtime=x.optInt("runtime");e.still=image(x.optString("still_path"),"w500");out.add(e);}return out;
    }

    private synchronized String eroticKeywordIds() throws Exception{
        if(eroticKeywordIds!=null)return eroticKeywordIds;
        StringBuilder ids=new StringBuilder();
        for(String term:new String[]{"erotic","erotica","erotic movie","erotic drama","erotic thriller","eroticism","bdsm","sexual obsession","sexual domination","sex worker","prostitution","stripper"}){
            Map<String,String> keywordQuery=new LinkedHashMap<>();keywordQuery.put("query",term);
            JSONArray keywords=get("/search/keyword",keywordQuery).optJSONArray("results");
            if(keywords!=null)for(int i=0;i<keywords.length();i++){
                JSONObject keyword=keywords.optJSONObject(i);
                if(term.equalsIgnoreCase(keyword.optString("name"))){int id=keyword.optInt("id");if(id>0){if(ids.length()>0)ids.append('|');ids.append(id);}break;}
            }
        }
        eroticKeywordIds=ids.toString();return eroticKeywordIds;
    }

    private JSONObject get(String path,Map<String,String> params) throws Exception{
        if(requestClient!=null)return requestClient.get(path,params);
        if(!configured())throw new IllegalStateException("missing-key");StringBuilder u=new StringBuilder(BASE).append(path).append("?api_key=").append(enc(key)).append("&language=it-IT");if(params!=null)for(Map.Entry<String,String> e:params.entrySet())u.append('&').append(enc(e.getKey())).append('=').append(enc(e.getValue()));
        HttpURLConnection c=(HttpURLConnection)new URL(u.toString()).openConnection();c.setConnectTimeout(timeout);c.setReadTimeout(timeout);c.setRequestProperty("Accept-Language","it-IT,it;q=0.9");c.setRequestProperty("Accept","application/json");
        int status=c.getResponseCode();InputStream stream=status>=200&&status<300?c.getInputStream():c.getErrorStream();StringBuilder body=new StringBuilder();try(BufferedReader r=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)body.append(line);}finally{c.disconnect();}if(status<200||status>=300)throw new IllegalStateException("TMDB "+status);return new JSONObject(body.toString());
    }
    private Models.Media mapMedia(JSONObject o,String type){Models.Media m=new Models.Media();m.tmdbId=o.optInt("id");m.id="tmdb-"+type+"-"+m.tmdbId;m.mediaType=type;m.title=o.optString("movie".equals(type)?"title":"name","Titolo senza nome");m.originalTitle=o.optString("movie".equals(type)?"original_title":"original_name",m.title);m.releaseDate=o.optString("tv".equals(type)?"first_air_date":"release_date");m.year=m.releaseDate.length()>=4?m.releaseDate.substring(0,4):"S.D.";m.overview=o.optString("overview","Trama non disponibile.");if(m.overview.isEmpty())m.overview="Trama non disponibile.";m.tagline=o.optString("tagline");m.poster=image(o.optString("poster_path"),"w342");m.backdrop=image(o.optString("backdrop_path"),"w780");m.rating=o.optDouble("vote_average");m.runtime=o.optInt("runtime");JSONArray countries=o.optJSONArray("production_countries");if(countries!=null&&countries.length()>0)m.country=countries.optJSONObject(0).optString("name");else{JSONArray origins=o.optJSONArray("origin_country");if(origins!=null&&origins.length()>0)m.country=origins.optString(0);}JSONArray languages=o.optJSONArray("spoken_languages");if(languages!=null&&languages.length()>0){JSONObject language=languages.optJSONObject(0);m.language=language.optString("name",language.optString("english_name"));}JSONObject collection=o.optJSONObject("belongs_to_collection");if(collection!=null){m.collectionId=collection.optInt("id");m.collectionName=collection.optString("name");}JSONArray er=o.optJSONArray("episode_run_time");if(er!=null&&er.length()>0)m.episodeRuntime=er.optInt(0);JSONArray ids=o.optJSONArray("genre_ids");if(ids!=null)for(int i=0;i<ids.length();i++){int id=ids.optInt(i);m.genreIds.add(id);String label=("tv".equals(type)?TV_GENRES:MOVIE_GENRES).get(id);if(label!=null&&m.genres.size()<3)m.genres.add(label);}JSONArray gs=o.optJSONArray("genres");if(gs!=null){m.genres.clear();m.genreIds.clear();for(int i=0;i<gs.length();i++){JSONObject g=gs.optJSONObject(i);m.genreIds.add(g.optInt("id"));if(m.genres.size()<3)m.genres.add(g.optString("name"));}}return m;}
    private List<Models.Media> mediaList(JSONArray a,String type,int limit){List<Models.Media> out=new ArrayList<>();if(a!=null)for(int i=0;i<Math.min(limit,a.length());i++)out.add(mapMedia(a.optJSONObject(i),type));return out;}
    private static List<Models.Provider> providers(JSONArray a,String kind){List<Models.Provider> out=new ArrayList<>();Set<Integer> seen=new HashSet<>();if(a!=null)for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);int id=o.optInt("provider_id");String name=o.optString("provider_name","Servizio");if("flatrate".equals(kind)&&name.toLowerCase(Locale.ROOT).contains("channel"))continue;if(seen.add(id)){Models.Provider p=new Models.Provider();p.id=id;p.name=name;p.logo=image(o.optString("logo_path"),"w92");p.kind=kind;out.add(p);}}return out;}
    private List<Models.Media> unique(List<Models.Media> in){LinkedHashMap<String,Models.Media> map=new LinkedHashMap<>();for(Models.Media m:in)map.putIfAbsent(m.id,m);return new ArrayList<>(map.values());}
    private static int titleRelevance(String title,String needle){String value=title==null?"":title.trim().toLowerCase(java.util.Locale.ROOT);if(value.equals(needle))return 0;if(value.startsWith(needle))return 1;if(value.contains(needle))return 2;return 3;}
    private static List<String> fuzzyQueries(String query){String value=query.trim();Set<String> out=new java.util.LinkedHashSet<>();out.add(value.substring(0,Math.min(3,value.length())));int middle=value.length()/2;for(int i=Math.max(0,middle-1);i<value.length()-1&&out.size()<3;i++){if(Character.isLetterOrDigit(value.charAt(i))&&Character.isLetterOrDigit(value.charAt(i+1))&&value.charAt(i)!=value.charAt(i+1)){char[] chars=value.toCharArray();char c=chars[i];chars[i]=chars[i+1];chars[i+1]=c;out.add(new String(chars));}}for(int i:new int[]{middle,Math.max(1,value.length()-2)}){if(out.size()>=4)break;if(i>0&&i<value.length()-1&&Character.isLetterOrDigit(value.charAt(i)))out.add(value.substring(0,i)+value.substring(i+1));if(out.size()>=4)break;String neighbors=keyboardNeighbors(value.charAt(i));if(!neighbors.isEmpty()){char[] chars=value.toCharArray();chars[i]=neighbors.charAt(0);out.add(new String(chars));}}return new ArrayList<>(out);}
    private static String keyboardNeighbors(char c){String key=String.valueOf(Character.toLowerCase(c));String[] rows={"qwertyuiop","asdfghjkl","zxcvbnm"};for(String row:rows){int i=row.indexOf(key);if(i>=0){StringBuilder out=new StringBuilder();if(i>0)out.append(row.charAt(i-1));if(i+1<row.length())out.append(row.charAt(i+1));return out.toString();}}return "";}
    private static int editDistance(String a,String b){int[] prev=new int[b.length()+1],next=new int[b.length()+1];for(int j=0;j<=b.length();j++)prev[j]=j;for(int i=1;i<=a.length();i++){next[0]=i;for(int j=1;j<=b.length();j++)next[j]=Math.min(Math.min(next[j-1]+1,prev[j]+1),prev[j-1]+(a.charAt(i-1)==b.charAt(j-1)?0:1));int[] tmp=prev;prev=next;next=tmp;}return prev[b.length()];}
    private static String image(String path,String size){return path==null||path.isEmpty()?"":"https://image.tmdb.org/t/p/"+size+path;}
    private static String enc(String v){try{return URLEncoder.encode(v,"UTF-8");}catch(Exception e){return v;}}
    private static void putGenres(Map<Integer,String> map,Object[][] rows){for(Object[] r:rows)map.put((Integer)r[0],(String)r[1]);}
}
