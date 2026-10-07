package it.dueffe.streamwise;

import android.content.Context;
import android.util.Xml;
import org.xmlpull.v1.XmlPullParser;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.GZIPInputStream;

final class TvGuideRepository {
    static final ZoneId ROME=ZoneId.of("Europe/Rome");
    static final String SOURCE="https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz";
    private static final DateTimeFormatter XML_TIME=DateTimeFormatter.ofPattern("yyyyMMddHHmmss xx");
    private static final Map<String,String> CHANNELS=new LinkedHashMap<>();
    static {
        String[][] channels={{"Rai.1.HD..101.it","Rai 1"},{"Rai.2.HD..102.it","Rai 2"},{"Rai.3.HD..103.it","Rai 3"},
            {"Rete.4.it","Rete 4"},{"Canale.5.it","Canale 5"},{"Italia.1.it","Italia 1"},{"LA7.HD.it","La7"},
            {"TV8.HD.it","TV8"},{"NOVE.HD..149.it","Nove"},{"20.it","20"},{"Rai.4..5021.it","Rai 4"},
            {"Iris.it","Iris"},{"Rai.5..5023.it","Rai 5"},{"Rai.Movie..5024.it","Rai Movie"},
            {"Rai.Premium..5025.it","Rai Premium"},{"cielo.it","Cielo"},{"27.Twentyseven.it","Twentyseven"},
            {"La.5.it","La 5"},{"Real.Time.HD..160.it","Real Time"},{"Mediaset.Extra.it","Mediaset Extra"},
            {"Italia.2.it","Italia 2"},{"GIALLO.HD..167.it","Giallo"},{"Top.Crime.it","Top Crime"},
            {"Cine34.it","Cine34"},{"Warner.TV.it","Warner TV"},{"LA7.CINEMA.it","La7 Cinema"},
            {"Boing.it","Boing"},{"Cartoonito.it","Cartoonito"},{"Rai.Gulp..5042.it","Rai Gulp"},
            {"Rai.Yoyo..5043.it","Rai Yoyo"},{"K2.it","K2"},{"Frisbee.it","Frisbee"},{"Super!.it","Super!"}};
        for(String[] pair:channels)CHANNELS.put(pair[0],pair[1]);
    }
    private static final int[] NUMBERS={1,2,3,4,5,6,7,8,9,20,21,22,23,24,25,26,27,30,31,55,66,38,39,34,37,29,40,46,42,43,41,44,47};
    static int channelNumber(String name){int i=0;for(String value:CHANNELS.values()){if(value.equals(name))return NUMBERS[i];i++;}return Integer.MAX_VALUE;}
    static String normalizedTitle(String title){return java.text.Normalizer.normalize(title,java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");}
    static Models.Media recognize(Programme programme,List<Models.Media> results){
        String title=normalizedTitle(programme.searchTitle());Models.Media found=null;
        for(Models.Media m:results)if(m.mediaType.equals(programme.type)&&(normalizedTitle(m.title).equals(title)||normalizedTitle(m.originalTitle).equals(title))){if(found!=null&&!found.id.equals(m.id))return null;found=m;}
        return found;
    }
    static final class Programme {
        String channel,title="",description="",image="",episode="",subtitle="",type="";
        Instant start,end;
        String key(){return channel+"|"+start+"|"+title;}
        String searchTitle(){return title.replaceFirst("(?i)\\s*-\\s*(stag\\.|s\\d+\\s*e\\d+).*", "").replaceFirst("\\s*\\(\\d{4}\\)\\s*$", "").trim();}
        boolean onAir(Instant now){return !now.isBefore(start)&&now.isBefore(end);}
    }
    static final class Guide {
        final Map<String,String> logos;final List<Programme> programmes;final SortedSet<LocalDate> dates;final boolean cached;final long updatedAt;
        Guide(List<Programme> programmes,SortedSet<LocalDate> dates,boolean cached,long updatedAt){
            this(programmes,dates,cached,updatedAt,new HashMap<>());
        }
        Guide(List<Programme> programmes,SortedSet<LocalDate> dates,boolean cached,long updatedAt,Map<String,String> logos){
            this.logos=logos;this.programmes=programmes;this.dates=dates;this.cached=cached;this.updatedAt=updatedAt;
        }
        List<Programme> remainingForDate(LocalDate date,Instant now){
            List<Programme> out=forDate(date);out.removeIf(p -> !p.end.isAfter(now));return out;
        }
        List<Programme> forDate(LocalDate date){
            Instant from=date.atStartOfDay(ROME).toInstant(),until=date.plusDays(1).atStartOfDay(ROME).toInstant();
            List<Programme> out=new ArrayList<>();
            for(Programme item:programmes)if(!item.start.isBefore(from)&&item.start.isBefore(until))out.add(item);
            return out;
        }
    }
    static synchronized Guide load(Context context,boolean force)throws Exception{
        File cache=new File(context.getCacheDir(),"digital-tv-guide.xml.gz");
        long age=System.currentTimeMillis()-cache.lastModified();
        if(!force&&cache.exists()&&age>=0&&age<30*60*1000L)try{return read(cache,false);}catch(Exception ignored){}
        File temp=new File(context.getCacheDir(),"digital-tv-guide.tmp");
        try{
            HttpURLConnection connection=(HttpURLConnection)new URL(SOURCE).openConnection();
            connection.setConnectTimeout(10000);connection.setReadTimeout(15000);
            try{
                if(connection.getResponseCode()!=200)throw new IOException("Guide unavailable");
                try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(temp)){
                    byte[] buffer=new byte[8192];int n,total=0;
                    while((n=input.read(buffer))!=-1){total+=n;if(total>8*1024*1024)throw new IOException("Guide too large");output.write(buffer,0,n);}
                }
            }finally{connection.disconnect();}
            Guide fresh=read(temp,false);
            if(!temp.renameTo(cache))throw new IOException("Cannot cache guide");
            cache.setLastModified(System.currentTimeMillis());
            return new Guide(fresh.programmes,fresh.dates,false,cache.lastModified(),fresh.logos);
        }catch(Exception error){
            if(cache.exists())try{return read(cache,true);}catch(Exception ignored){}
            throw error;
        }finally{temp.delete();}
    }
    private static Guide read(File file,boolean cached)throws Exception{
        try(InputStream input=new GZIPInputStream(new FileInputStream(file))){
            Guide guide=parse(input);return new Guide(guide.programmes,guide.dates,cached,file.lastModified(),guide.logos);
        }
    }
    static Guide parse(InputStream input)throws Exception{
        XmlPullParser parser=Xml.newPullParser();parser.setInput(new LimitedInputStream(input),"UTF-8");
        Map<String,Programme> programmes=new LinkedHashMap<>();SortedSet<LocalDate> dates=new TreeSet<>();
        Map<String,String> logos=new HashMap<>();String logoChannel=null;
        Programme current=null;List<String> categories=new ArrayList<>();boolean director=false;
        for(int event=parser.getEventType();event!=XmlPullParser.END_DOCUMENT;event=parser.next()){
            if(event==XmlPullParser.DOCDECL)throw new IOException("Unexpected document declaration");
            if(event==XmlPullParser.START_TAG){
                String tag=parser.getName();
                if("channel".equals(tag))logoChannel="Nove.it".equals(parser.getAttributeValue(null,"id"))?"Nove":CHANNELS.get(parser.getAttributeValue(null,"id"));
                else if("icon".equals(tag)&&logoChannel!=null){String url=parser.getAttributeValue(null,"src");if(url!=null&&url.startsWith("https://"))logos.put(logoChannel,url);}
                else if("programme".equals(tag)){
                    current=null;categories.clear();director=false;
                    String channel=CHANNELS.get(parser.getAttributeValue(null,"channel"));if(channel==null)continue;
                    try{
                        Instant start=parseTime(parser.getAttributeValue(null,"start")),end=parseTime(parser.getAttributeValue(null,"stop"));
                        if(!end.isAfter(start)||Duration.between(start,end).toHours()>12)continue;
                        LocalDate first=start.atZone(ROME).toLocalDate();
                        dates.add(first);
                        current=new Programme();current.channel=channel;current.start=start;current.end=end;
                    }catch(Exception ignored){}
                }else if(current!=null){
                    if("title".equals(tag)){String text=parser.nextText();if(current.title.isEmpty())current.title=text;}
                    else if("desc".equals(tag)){String text=parser.nextText();if(current.description.isEmpty())current.description=text;}
                    else if("sub-title".equals(tag))current.subtitle=parser.nextText();
                    else if("category".equals(tag))categories.add(parser.nextText().toLowerCase(Locale.ROOT));
                    else if("episode-num".equals(tag)){String text=parser.nextText();if(current.episode.isEmpty())current.episode=text;}
                    else if("icon".equals(tag)&&current.image.isEmpty()){String url=parser.getAttributeValue(null,"src");if(url!=null&&url.startsWith("https://"))current.image=url;}
                    else if("director".equals(tag))director=true;
                }
            }else if(event==XmlPullParser.END_TAG&&"channel".equals(parser.getName()))logoChannel=null;
            else if(event==XmlPullParser.END_TAG&&"programme".equals(parser.getName())&&current!=null){
                current.type=classify(categories,current.episode,director);
                if(!current.type.isEmpty()&&!current.title.trim().isEmpty())programmes.putIfAbsent(current.key(),current);
                current=null;
            }
        }
        logos.putIfAbsent("K2","https://img-guidatv.org/loghi/b/k2.png");
        logos.putIfAbsent("Frisbee","https://img-guidatv.org/loghi/b/frisbee.png");
        if(dates.isEmpty())throw new IOException("No terrestrial schedules");
        List<Programme> sorted=new ArrayList<>(programmes.values());
        sorted.sort(Comparator.comparing((Programme p)->p.start).thenComparing(p->p.channel).thenComparing(p->p.title));
        return new Guide(sorted,dates,false,0,logos);
    }
    static Instant parseTime(String text){return OffsetDateTime.parse(text.trim().replaceAll("\\s+"," "),XML_TIME).toInstant();}
    private static String classify(List<String> categories,String episode,boolean director){
        for(String value:categories)if(value.equals("film")||value.equals("movie"))return "movie";
        for(String value:categories)if(value.equals("fiction")||value.contains("serie")||value.contains("sitcom"))return "tv";
        for(String value:categories)if(value.contains("show")||value.contains("intrattenimento")||value.contains("sport")||value.contains("informazione")||value.contains("documentario")||value.contains("reality")||value.contains("notiziario")||value.contains("quiz")||value.contains("varietà")||value.contains("attualit"))return "";
        if(!episode.isEmpty())return "tv";
        if(director)for(String value:categories)if(Arrays.asList("azione","commedia","drammatico","thriller","horror","avventura","fantascienza","western","romantico","fantastico","animazione").contains(value))return "movie";
        return "";
    }
    private static final class LimitedInputStream extends FilterInputStream{
        private int total;LimitedInputStream(InputStream input){super(input);}
        private void count(int n)throws IOException{if(n>0){total+=n;if(total>40*1024*1024)throw new IOException("Expanded guide too large");}}
        @Override public int read()throws IOException{int n=in.read();if(n>=0)count(1);return n;}
        @Override public int read(byte[] data,int offset,int length)throws IOException{int n=in.read(data,offset,length);count(n);return n;}
    }
}
