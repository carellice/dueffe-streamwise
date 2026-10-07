package it.dueffe.streamwise;

import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.List;

/** Device checks without additional test dependencies or changes to the user's library. */
public final class StreamWiseInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        Bundle status = new Bundle();
        status.putString("class", getClass().getName()); status.putString("test", "streamWiseFeatures");
        status.putInt("numtests", 1); status.putInt("current", 1); status.putString("id", "InstrumentationTestRunner");
        sendStatus(1, status);
        try {
            Context isolated = new ContextWrapper(getTargetContext()) {
                @Override public Context getApplicationContext() { return this; }
                @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                    return super.getSharedPreferences("instrumentation-"+name, mode);
                }
            };
            isolated.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE).edit().clear().commit();
            Models.Media media = new Models.Media(); media.id="tmdb-tv-123"; media.tmdbId=123; media.mediaType="tv"; media.title="Test";
            List<Models.Season> seasons = new ArrayList<>();
            for(int season=1;season<=2;season++) {
                Models.Season item=new Models.Season();item.number=season;item.episodeCount=2;
                for(int episode=1;episode<=2;episode++) {Models.Episode ep=new Models.Episode();ep.season=season;ep.number=episode;item.episodes.add(ep);}
                seasons.add(item);
            }
            LibraryStore store=new LibraryStore(isolated);store.save(media);
            store.markEpisode(media,seasons.get(0).episodes.get(0),seasons,null);
            check(store.get(media).nextSeason==1&&store.get(media).nextEpisode==2,"next episode");
            store.markEpisode(media,seasons.get(0).episodes.get(1),seasons,null);
            check(store.get(media).nextSeason==2&&store.get(media).nextEpisode==1,"season boundary");
            EpisodesWidgetService.Factory factory=new EpisodesWidgetService.Factory(isolated);
            factory.onDataSetChanged();check(factory.getCount()==1,"widget list");
            check(EpisodesWidget.find(store,media.id,1,2)==null,"stale widget tap ignored");
            check(EpisodesWidget.find(store,media.id,2,1)!=null,"current widget tap accepted");
            runOnMainSync(() -> {
                android.view.View row=factory.getViewAt(0).apply(getTargetContext(),null);
                check(row.findViewById(R.id.widget_seen).getVisibility()==android.view.View.VISIBLE,"seen action visible");
            });
            isolated.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE).edit()
                .putBoolean(EpisodesWidget.reactionKey(media.id,2,1),true).commit();
            runOnMainSync(() -> {
                android.view.View row=factory.getViewAt(0).apply(getTargetContext(),null);
                check(row.findViewById(R.id.widget_reactions).getVisibility()==android.view.View.VISIBLE,"final reaction buttons");
            });
            LibraryStore widgetStore=new LibraryStore(isolated);
            widgetStore.markEpisode(media,seasons.get(1).episodes.get(0),seasons,null);
            store.reload();check(store.get(media).nextEpisode==2,"widget/app synchronization");
            boolean reactionRequired=false;
            try {widgetStore.markEpisode(media,seasons.get(1).episodes.get(1),seasons,null);} catch(IllegalArgumentException expected){reactionRequired=true;}
            check(reactionRequired&&"progress".equals(widgetStore.state(media)),"final reaction required");
            widgetStore.markEpisode(media,seasons.get(1).episodes.get(1),seasons,false);
            store.reload();check("watched".equals(store.state(media))&&Boolean.FALSE.equals(store.get(media).liked),"final completion");
            check(store.get(media).completedEpisodeCount==4,"persisted completed count");
            factory.onDataSetChanged();check(factory.getCount()==0,"completed series removed from widget");
            runOnMainSync(() -> {
                new RemoteViews(getTargetContext().getPackageName(),R.layout.widget_episodes).apply(getTargetContext(),null);
                new RemoteViews(getTargetContext().getPackageName(),R.layout.widget_episode_row).apply(getTargetContext(),null);
                RemoteViews widget=new RemoteViews(getTargetContext().getPackageName(),R.layout.widget_episodes);
                widget.setViewVisibility(R.id.widget_episodes,android.view.View.GONE);
                renderWidget(widget,"widget-empty.png",320,240);
                RemoteViews row=new RemoteViews(getTargetContext().getPackageName(),R.layout.widget_episode_row);
                row.setTextViewText(R.id.widget_series,"Stranger Things");row.setTextViewText(R.id.widget_episode,"Prossimo: S2 · E4");
                renderWidget(row,"widget-row.png",288,0);
                row.setViewVisibility(R.id.widget_seen,android.view.View.GONE);row.setViewVisibility(R.id.widget_reactions,android.view.View.VISIBLE);
                renderWidget(row,"widget-reactions.png",288,0);
            });
            check(TmdbApi.readableLocalizedTitle("L’estate di São Paulo — stagione 2"),"Latin titles, accents and punctuation accepted");
            check(TmdbApi.readableLocalizedTitle("Squid Game"),"localized Asian series remain eligible");
            check(!TmdbApi.readableLocalizedTitle("東京の物語")&&!TmdbApi.readableLocalizedTitle("사랑 이야기")&&!TmdbApi.readableLocalizedTitle("Series 東京"),"unlocalized titles excluded");
            check(TmdbApi.readableLocalizedTitle("1899")&&!TmdbApi.readableLocalizedTitle(" ")&&!TmdbApi.readableLocalizedTitle("🎬"),"numeric titles accepted and empty names excluded");
            checkDirectors();
            checkSubscriptions(isolated);
            checkTvGuide();
            checkTvReminders(isolated);
            TvGuideRepository.Guide liveGuide=TvGuideRepository.load(isolated,true);
            java.time.LocalDate today=java.time.LocalDate.now(TvGuideRepository.ROME);
            check(!liveGuide.forDate(today).isEmpty(),"live full-day TV guide");
            check(liveGuide.forDate(today).stream().anyMatch(p -> "movie".equals(p.type)),"live TV movies");
            check(liveGuide.forDate(today).stream().anyMatch(p -> "tv".equals(p.type)),"live TV series");
            java.time.LocalDate other=liveGuide.programmes.stream().map(p -> p.start.atZone(TvGuideRepository.ROME).toLocalDate()).filter(d -> !d.equals(today)).findFirst().orElseThrow(() -> new AssertionError("other day"));
            check(!liveGuide.forDate(other).isEmpty(),"another selectable day");
            check(!TvGuideRepository.load(isolated,false).cached,"fresh guide cache");
            TmdbApi api=new TmdbApi(BuildConfig.TMDB_API_KEY);
            if(api.configured()) {
                for(String type:new String[]{"movie","tv"})for(boolean upcoming:new boolean[]{false,true}){
                    List<Models.Media> releases=api.newReleases(type,1,upcoming);check(!releases.isEmpty(),"live new releases "+type+" "+upcoming);
                    java.time.LocalDate releaseToday=java.time.LocalDate.now(TvGuideRepository.ROME);
                    check(releases.stream().anyMatch(m->!m.releaseDate.isEmpty()),"new releases have verified dates");
                    for(Models.Media release:releases){if(release.releaseDate.isEmpty())continue;java.time.LocalDate date=java.time.LocalDate.parse(release.releaseDate);check(upcoming?date.isAfter(releaseToday)&&!date.isAfter(releaseToday.plusDays(60)):!date.isAfter(releaseToday)&&!date.isBefore(releaseToday.minusDays(60)),"release dates within selected period");}
                    check(releases.stream().map(m->m.id).distinct().count()==releases.size(),"new releases have unique ids");
                    if(type.equals("tv")&&upcoming)check(releases.stream().allMatch(m->TmdbApi.readableLocalizedTitle(m.title)&&!m.poster.isEmpty()),"upcoming series all have localized titles and posters");
                }
                TmdbApi.ReleasePage upcomingSeries=api.newReleasesPage("tv",1,true);
                TmdbApi.ReleasePage otherSeries=api.newReleasesPage("tv",2,true);
                check(upcomingSeries.hasMore&&!otherSeries.media.isEmpty(),"filtered series pagination continues beyond first candidate batch");
                Models.Media inception=new Models.Media();inception.id="tmdb-movie-27205";inception.tmdbId=27205;
                Models.Media movieDetail=api.details(inception);
                check(movieDetail.directors.stream().anyMatch(p->p.id==525&&p.director),"live film director detail");
                Models.Media breakingBad=new Models.Media();breakingBad.id="tmdb-tv-1396";breakingBad.tmdbId=1396;breakingBad.mediaType="tv";
                check(api.details(breakingBad).directors.size()>1,"live series aggregate directors");
                check(api.searchPeople("Christopher Nolan",true).stream().anyMatch(p->p.id==525&&p.director),"live director search");
                check(api.searchPeople("Bradley Cooper",true).stream().anyMatch(p->p.id==51329&&p.director),"actors who also direct searchable");
                check(api.personCredits(525,true).stream().anyMatch(m->m.tmdbId==27205&&m.mediaType.equals("movie")),"live directed filmography");
                check(!api.personCredits(31,false).isEmpty(),"actor filmography retained");
                List<Models.Provider> directory=api.subscriptionDirectory();
                check(directory.stream().anyMatch(p -> p.id==8)&&directory.stream().anyMatch(p -> p.id==119),"live Italian subscription directory");
                Models.Media liveMovie=new Models.Media();liveMovie.id="tmdb-movie-27205";liveMovie.tmdbId=27205;
                List<Models.Provider> availability=api.subscriptionAvailability(liveMovie);
                check(availability.stream().allMatch(p -> p.kind.equals("flatrate")&&!p.name.toLowerCase(java.util.Locale.ROOT).contains("channel")),"live subscription-only providers");
                check(!api.trueCrime("movie",1).isEmpty(),"true crime movies");
                check(!api.trueCrime("tv",1).isEmpty(),"true crime TV");
                check(!api.trueCrime("tv",2).isEmpty(),"true crime pagination");
            }
            isolated.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE).edit().clear().commit();
            result.putString("stream", "PASS: episode advance, season boundary, widget/app sync, final reaction, persistence, widget layouts, True crime movie/TV/pagination, TV guide full-day/dates/timezones/deduplication/channel filtering/cache/live feed, channel logos/LCN, expired broadcasts, automatic recognition, reminder offsets/persistence/edit/restore/cancel/notification delivery, manual subscriptions/monthly migration/backup/ranking/overlap/provider aliases/filters/cache/live providers, film/series directors/deduplication/persistence/director search/directing credits/actor regression, new movie/TV releases/dates/upcoming/widget visual rendering\n");
            sendStatus(0,status); finish(-1,result);
        } catch(Throwable error) {status.putString("stack",android.util.Log.getStackTraceString(error));sendStatus(-2,status);result.putString("stream","FAIL: "+error+"\n");finish(0,result);}
    }
    private void renderWidget(RemoteViews remote,String name,int widthDp,int heightDp){
        Context context=getTargetContext();float density=context.getResources().getDisplayMetrics().density;
        android.view.View view=remote.apply(context,null);int width=(int)(widthDp*density),height=(int)(heightDp*density);
        view.measure(android.view.View.MeasureSpec.makeMeasureSpec(width,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(height,heightDp==0?android.view.View.MeasureSpec.UNSPECIFIED:android.view.View.MeasureSpec.EXACTLY));
        view.layout(0,0,width,view.getMeasuredHeight());android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(width,view.getMeasuredHeight(),android.graphics.Bitmap.Config.ARGB_8888);view.draw(new android.graphics.Canvas(bitmap));
        try(java.io.FileOutputStream output=new java.io.FileOutputStream(new java.io.File(context.getCacheDir(),name))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}catch(Exception e){throw new RuntimeException(e);}finally{bitmap.recycle();}
    }
    private static void checkDirectors() throws Exception {
        org.json.JSONObject regional=new org.json.JSONObject("{\"results\":[{\"iso_3166_1\":\"US\",\"release_dates\":[{\"type\":3,\"release_date\":\"2026-01-01T00:00:00Z\"}]},{\"iso_3166_1\":\"IT\",\"release_dates\":[{\"type\":3,\"release_date\":\"2026-10-10T00:00:00Z\"},{\"type\":4,\"release_date\":\"2026-10-12T00:00:00Z\"}]}]}");
        check("2026-10-10".equals(TmdbApi.italianReleaseDate(regional,java.time.LocalDate.parse("2026-10-01"),java.time.LocalDate.parse("2026-10-31"))),"Italian theatrical date preferred over original and digital dates");
        check(TmdbApi.italianReleaseDate(regional,java.time.LocalDate.parse("2026-11-01"),java.time.LocalDate.parse("2026-11-30")).isEmpty(),"unknown regional release date remains unavailable");
        org.json.JSONObject director=new org.json.JSONObject().put("id",10).put("name","Director").put("job","Director");
        org.json.JSONObject producer=new org.json.JSONObject().put("id",20).put("name","Producer").put("job","Producer");
        org.json.JSONObject credits=new org.json.JSONObject().put("crew",new org.json.JSONArray().put(director).put(producer).put(director));
        List<Models.Person> people=TmdbApi.directors(credits);
        check(people.size()==1&&people.get(0).id==10&&people.get(0).director,"only directors and no duplicates");
        org.json.JSONObject tvDirector=new org.json.JSONObject().put("id",30).put("name","TV director").put("jobs",new org.json.JSONArray().put(new org.json.JSONObject().put("job","Writer")).put(new org.json.JSONObject().put("job","Director")));
        check(TmdbApi.directors(new org.json.JSONObject().put("crew",new org.json.JSONArray().put(tvDirector))).size()==1,"aggregate TV directing jobs parsed");
        check(TmdbApi.directors(null).isEmpty(),"missing directing credits accepted");
        Models.Media media=new Models.Media();media.directors=people;
        check(Models.Media.from(media.json()).directors.get(0).id==10&&Models.Media.from(media.json()).directors.get(0).director,"directors survive library persistence and backup");
        org.json.JSONObject film=new org.json.JSONObject().put("id",100).put("title","Directed film").put("media_type","movie").put("job","Director");
        org.json.JSONObject written=new org.json.JSONObject().put("id",200).put("title","Written film").put("media_type","movie").put("job","Writer");
        org.json.JSONObject acted=new org.json.JSONObject().put("id",300).put("title","Acted film").put("media_type","movie");
        org.json.JSONObject series=new org.json.JSONObject().put("id",100).put("name","Directed series").put("media_type","tv").put("job","Director");
        org.json.JSONObject all=new org.json.JSONObject().put("crew",new org.json.JSONArray().put(film).put(film).put(written).put(series)).put("cast",new org.json.JSONArray().put(acted));
        TmdbApi api=new TmdbApi("");List<Models.Media> directed=api.mapPersonCredits(all,true);
        check(directed.size()==2&&directed.stream().noneMatch(m->m.tmdbId==200||m.tmdbId==300),"directing-only titles deduplicated without conflating film and TV ids");
        check(api.mapPersonCredits(all,false).size()==1&&api.mapPersonCredits(all,false).get(0).tmdbId==300,"acting-only credits unchanged");
    }
    private static void checkTvGuide() throws Exception {
        String movie="<programme channel='Italia.1.it' start='20261006070000 +0000' stop='20261006090000 +0000'><title>Film del mattino</title><category>Film</category></programme>";
        String xml="<tv><channel id='Italia.1.it'><icon src='https://example.com/logo.png'/></channel>"+movie+movie
            +"<programme channel='Iris.it' start='20261005225000 +0200' stop='20261006013600 +0200'><title>Notturno</title><category>Film</category></programme>"
            +"<programme channel='GIALLO.HD..167.it' start='20261006223000 +0000' stop='20261006233000 +0000'><title>Una serie - Stag. 2 Ep. 3</title><category>Fiction</category><episode-num>S2 E3</episode-num></programme>"
            +"<programme channel='Sky.Cinema.Uno.it' start='20261006190000 +0000' stop='20261006210000 +0000'><title>Pay TV</title><category>Film</category></programme>"
            +"<programme channel='Italia.1.it' start='20261006200000 +0200' stop='20261006210000 +0200'><title>Quiz</title><category>Quiz</category><episode-num>S1 E3</episode-num></programme>"
            +"<programme channel='Italia.1.it' start='invalid' stop='invalid'><title>Invalid</title><category>Film</category></programme></tv>";
        TvGuideRepository.Guide guide=TvGuideRepository.parse(new java.io.ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        check("https://example.com/logo.png".equals(guide.logos.get("Italia 1")),"channel logo parsing");
        check(TvGuideRepository.channelNumber("Rai 1")==1&&TvGuideRepository.channelNumber("Warner TV")==37&&TvGuideRepository.channelNumber("Italia 2")==66,"LCN channel ordering");
        java.time.LocalDate day=java.time.LocalDate.of(2026,10,6);
        check(guide.remainingForDate(day,java.time.Instant.parse("2026-10-06T09:00:00Z")).isEmpty(),"finished titles disappear including exact end");
        check(guide.remainingForDate(day,java.time.Instant.parse("2026-10-06T08:00:00Z")).size()==1,"on-air title remains visible");
        check(guide.forDate(day).size()==1,"full day, terrestrial-only fiction, duplicate and invalid filtering");
        check(guide.forDate(day.minusDays(1)).size()==1&&guide.forDate(day.minusDays(1)).get(0).title.equals("Notturno"),"22:50 to 01:36 belongs only to start day");
        check(guide.remainingForDate(day,java.time.Instant.parse("2026-10-05T22:30:00Z")).stream().noneMatch(p -> p.title.equals("Notturno")),"overnight broadcast excluded from next day even while on air");
        check(guide.forDate(day).get(0).start.atZone(TvGuideRepository.ROME).getHour()==9,"UTC to Rome conversion");
        check(guide.forDate(day.plusDays(1)).size()==1,"another day selected");
        check(guide.forDate(day.plusDays(1)).get(0).searchTitle().equals("Una serie"),"series search title");
        check(guide.forDate(day.plusDays(10)).isEmpty()&&!guide.dates.contains(day.plusDays(10)),"unavailable date reported");
        check(TvGuideRepository.parseTime("20260106210000 +0100").equals(java.time.Instant.parse("2026-01-06T20:00:00Z")),"winter timezone");
        String midnight="<tv><programme channel='Italia.1.it' start='20260107000000 +0100' stop='20260107010000 +0100'><title>Mezzanotte</title><category>Film</category></programme></tv>";
        TvGuideRepository.Guide boundary=TvGuideRepository.parse(new java.io.ByteArrayInputStream(midnight.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        check(boundary.forDate(java.time.LocalDate.of(2026,1,7)).size()==1&&boundary.forDate(java.time.LocalDate.of(2026,1,6)).isEmpty(),"exact midnight included only in new local day");
        check(!guide.programmes.get(0).onAir(guide.programmes.get(0).end),"broadcast end excluded from live filter");
        check(guide.programmes.get(0).onAir(guide.programmes.get(0).start),"broadcast start included in live filter");
    }
    private static void checkTvReminders(Context context)throws Exception {
        TvGuideRepository.Programme p=new TvGuideRepository.Programme();p.title="Caffè - Stag. 2 Ep. 1";p.channel="Rai 1";p.type="tv";
        p.start=java.time.Instant.now().plusSeconds(7200);p.end=p.start.plusSeconds(3600);
        Models.Media m=new Models.Media();m.id="tmdb-tv-1";m.title="CAFFE";m.mediaType="tv";
        check(TvGuideRepository.recognize(p,java.util.Arrays.asList(m))==m,"automatic normalized recognition");
        Models.Media other=new Models.Media();other.id="tmdb-tv-2";other.title="Caffè";other.mediaType="tv";
        check(TvGuideRepository.recognize(p,java.util.Arrays.asList(m,other))==null,"ambiguous recognition rejected");
        check(TvReminderReceiver.trigger(p,15)==p.start.toEpochMilli()-900000,"reminder offset");
        context.getSharedPreferences("tv-reminders",Context.MODE_PRIVATE).edit().clear().commit();
        boolean invalid=false;try{TvReminderReceiver.save(context,p,1440);}catch(IllegalArgumentException expected){invalid=true;}
        check(invalid,"past reminder rejected");
        if(TvReminderReceiver.exactAllowed(context)&&TvReminderReceiver.notificationsAllowed(context)) {
            try {
                TvReminderReceiver.save(context,p,15);check(TvReminderReceiver.minutes(context,p.key())==15,"reminder persisted");
                TvReminderReceiver.restore(context);check(TvReminderReceiver.minutes(context,p.key())==15,"reminder restored");
                TvReminderReceiver.save(context,p,30);check(TvReminderReceiver.minutes(context,p.key())==30,"reminder edited");
                new TvReminderReceiver().onReceive(context,new android.content.Intent("it.dueffe.streamwise.TV_REMINDER").putExtra("key",p.key()));
                check(TvReminderReceiver.minutes(context,p.key())==-1,"delivered reminder consumed");
                android.service.notification.StatusBarNotification[] notifications=context.getSystemService(android.app.NotificationManager.class).getActiveNotifications();
                check(java.util.Arrays.stream(notifications).anyMatch(n -> p.key().equals(n.getTag())&&p.title.equals(n.getNotification().extras.getString(android.app.Notification.EXTRA_TITLE))),"reminder notification delivered");
            } finally {TvReminderReceiver.cancel(context,p.key());context.getSystemService(android.app.NotificationManager.class).cancel(p.key(),0);}
            check(TvReminderReceiver.minutes(context,p.key())==-1,"reminder removed");
        } else throw new AssertionError("emulator reminder permissions required");
    }
    private static Models.Provider testProvider(int id,String name){Models.Provider p=new Models.Provider();p.id=id;p.name=name;p.kind="flatrate";return p;}
    private static Models.LibraryEntry testEntry(String id,String state,Models.Provider... providers){
        Models.LibraryEntry entry=new Models.LibraryEntry();entry.media=new Models.Media();entry.media.id=id;entry.media.title=id;entry.state=state;entry.media.flatrate.addAll(java.util.Arrays.asList(providers));return entry;
    }
    private static void checkSubscriptions(Context context)throws Exception{
        SubscriptionRepository.prefs(context).edit().clear().commit();
        LibraryStore store=new LibraryStore(context);
        java.util.Set<Integer> active=new java.util.LinkedHashSet<>(java.util.Arrays.asList(8,119));
        store.setSubscriptions(active);check(store.subscriptions().equals(active),"multiple manual subscriptions persisted");
        check(new LibraryStore(context).subscriptions().equals(active),"subscriptions survive store recreation");
        String backup=store.exportJson();store.setSubscriptions(java.util.Collections.emptySet());
        check(store.importJson(backup)&&store.subscriptions().equals(active),"subscriptions restored from backup");
        android.content.SharedPreferences nativePrefs=context.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE);
        String currentMonth=java.time.YearMonth.now(TvGuideRepository.ROME).toString();
        org.json.JSONObject legacy=new org.json.JSONObject().put("2020-01",new org.json.JSONArray(java.util.Arrays.asList(337))).put(currentMonth,new org.json.JSONArray(active));
        nativePrefs.edit().putString("subscriptions",legacy.toString()).commit();
        check(store.subscriptions().equals(active)&&nativePrefs.getString("subscriptions","").startsWith("["),"current monthly selection migrated permanently");
        store.setSubscriptions(java.util.Collections.singleton(337));
        check(new LibraryStore(context).subscriptions().equals(java.util.Collections.singleton(337)),"manual change replaces previous selection");
        legacy.put(currentMonth,new org.json.JSONArray());nativePrefs.edit().putString("subscriptions",legacy.toString()).commit();
        check(store.subscriptions().isEmpty(),"explicit empty current selection retained on migration");
        legacy.remove(currentMonth);legacy.put("2020-02",new org.json.JSONArray(active));
        nativePrefs.edit().putString("subscriptions",legacy.toString()).commit();
        check(store.subscriptions().equals(active),"latest historical selection retained when current month missing");
        org.json.JSONObject legacyBackup=new org.json.JSONObject(backup).put("subscriptions",legacy);
        store.setSubscriptions(java.util.Collections.emptySet());
        check(store.importJson(legacyBackup.toString())&&store.subscriptions().equals(active),"legacy monthly backup migrated");
        Models.Provider netflix=testProvider(8,"Netflix"),prime=testProvider(119,"Prime Video"),ads=testProvider(1796,"Netflix Standard with Ads");
        Models.LibraryEntry saved=testEntry("subscription-test-saved","saved",netflix,ads),both=testEntry("subscription-test-both","progress",netflix,prime),extra=testEntry("subscription-test-extra","saved",prime),watched=testEntry("subscription-test-watched","watched",prime),hidden=testEntry("subscription-test-hidden","hidden",prime),rented=testEntry("subscription-test-rented","saved");
        rented.media.rent.add(prime);rented.media.buy.add(netflix);
        List<Models.LibraryEntry> entries=java.util.Arrays.asList(saved,both,extra,watched,hidden,rented,saved);
        java.util.Map<String,SubscriptionRepository.Availability> snapshots=new java.util.HashMap<>();
        for(Models.LibraryEntry e:entries)snapshots.put(e.media.id,SubscriptionRepository.cached(context,e.media));
        List<Models.Provider> services=java.util.Arrays.asList(prime,netflix,testProvider(337,"Disney+"));
        List<SubscriptionRepository.Rank> ranks=SubscriptionRepository.rank(entries,snapshots,services,java.util.Collections.singleton(8));
        check(ranks.get(0).provider.id==8&&ranks.get(0).total()==2&&ranks.get(0).saved==1&&ranks.get(0).progress==1,"rank totals split by state and deduplicate titles/ads");
        check(ranks.get(1).provider.id==119&&ranks.get(1).total()==2&&ranks.get(1).additional==1,"overlap excluded from additional subscription benefit");
        check(ranks.get(2).total()==0,"zero coverage and rent/buy/watched/hidden excluded");
        check(SubscriptionRepository.included(snapshots.get(both.media.id),active),"active subscriptions use union");
        check(!SubscriptionRepository.included(snapshots.get(rented.media.id),active),"rental and purchase do not pass subscription filter");
        check(!SubscriptionRepository.included(snapshots.get(saved.media.id),java.util.Collections.singleton(119)),"specific service filter");
        check(!SubscriptionRepository.included(snapshots.get(saved.media.id),java.util.Collections.emptySet()),"no active subscriptions shows no subscribed titles");
        long now=System.currentTimeMillis();
        org.json.JSONObject cache=new org.json.JSONObject().put("checkedAt",now).put("providers",Models.providersJson(java.util.Arrays.asList(prime)));
        SubscriptionRepository.prefs(context).edit().putString(extra.media.id,cache.toString()).commit();
        check(SubscriptionRepository.cached(context,extra.media).fresh(),"fresh availability snapshot");
        check(!SubscriptionRepository.load(context,new TmdbApi(""),extra.media,false).failed,"fresh snapshot avoids network");
        SubscriptionRepository.Availability fallback=SubscriptionRepository.load(context,new TmdbApi(""),extra.media,true);
        check(fallback.failed&&fallback.verified&&fallback.providers.size()==1,"failed refresh preserves verified availability");
        cache.put("checkedAt",now-25*60*60*1000L);SubscriptionRepository.prefs(context).edit().putString(extra.media.id,cache.toString()).commit();
        check(!SubscriptionRepository.cached(context,extra.media).fresh(),"stale availability refresh required");
        Models.Provider custom=testProvider(99999,"Test service");SubscriptionRepository.saveServices(context,java.util.Arrays.asList(custom));
        check(SubscriptionRepository.savedServices(context).stream().anyMatch(p->p.id==99999),"service directory survives removed titles and restart");
        store.setSubscriptions(java.util.Collections.emptySet());SubscriptionRepository.prefs(context).edit().clear().commit();
    }
    private static void check(boolean condition,String name) {if(!condition)throw new AssertionError(name);}
}
