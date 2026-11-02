package it.dueffe.streamwise;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Periodically compares followed titles with TMDB and notifies new episodes, releases and streaming arrivals. */
public final class ReleaseCheckWorker extends Worker {
    static final String CHANNEL="followed-releases";
    private static final String PERIODIC="release-follow-check",NOW="release-follow-check-now",INTERACTIVE="interactive";
    private static final String STATE_PREFS="followed-releases-state",LAST_CHECK="last-check";

    public ReleaseCheckWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    private static Constraints network(){return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();}

    private static boolean nothingFollowed(Context c){return ReleaseFollows.prefs(c).getAll().isEmpty()&&PersonFollows.prefs(c).getAll().isEmpty();}
    /** Keeps the periodic check alive only while something is followed. */
    static void schedule(Context c){
        WorkManager manager=WorkManager.getInstance(c.getApplicationContext());
        if(nothingFollowed(c)){manager.cancelUniqueWork(PERIODIC);return;}
        PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(ReleaseCheckWorker.class,2,TimeUnit.HOURS)
            .setConstraints(network()).build();
        manager.enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.KEEP,request);
    }
    /** Immediate check, e.g. when the app opens; not limited by quiet hours because the user is active. */
    static void checkNow(Context c){
        if(nothingFollowed(c))return;
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(ReleaseCheckWorker.class)
            .setConstraints(network()).setInputData(new Data.Builder().putBoolean(INTERACTIVE,true).build()).build();
        WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(NOW,ExistingWorkPolicy.REPLACE,request);
    }
    /** Called on app start: refreshes follows at most every 30 minutes. */
    static void refreshOnLaunch(Context c){
        schedule(c);
        long last=c.getSharedPreferences(STATE_PREFS,Context.MODE_PRIVATE).getLong(LAST_CHECK,0);
        if(System.currentTimeMillis()-last>30*60*1000L)checkNow(c);
    }

    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();
        // Server mode: the server checks the releases; the phone refreshes its copy and shows what it announced.
        if(ServerSync.INSTANCE.active(c)){
            ServerSync.INSTANCE.backgroundCheckBlocking(c);
            return Result.success();
        }
        ZonedDateTime now=ZonedDateTime.now(TvGuideRepository.ROME);
        // Background checks stay silent at night; the next morning run delivers what was released.
        if(!getInputData().getBoolean(INTERACTIVE,false)&&(now.getHour()<8||now.getHour()>=23))return Result.success();
        TmdbApi api=new TmdbApi(BuildConfig.TMDB_API_KEY,15000);
        if(!api.configured())return Result.success();
        LocalDate today=now.toLocalDate();boolean failed=false;
        for(ReleaseFollows.Follow follow:ReleaseFollows.all(c)){
            if(isStopped())break;
            if(follow.completed())continue;
            try{
                List<ReleaseFollows.Notice> notices=ReleaseFollows.evaluate(follow,api.releaseInfo(follow.media),today);
                if(ReleaseFollows.update(c,follow))for(ReleaseFollows.Notice notice:notices)notify(c,follow,notice);
            }catch(Exception e){failed=true;}
        }
        boolean hideShows=LibraryStore.hideShowCredits(c);
        for(PersonFollows.Follow follow:PersonFollows.all(c)){
            if(isStopped())break;
            try{
                org.json.JSONObject credits=api.personCreditsJson(follow.person.id);
                List<Models.Media> all=api.mapPersonCredits(credits,follow.person.director,false);
                java.util.Set<String> shows=new java.util.HashSet<>();
                if(hideShows){for(Models.Media m:all)shows.add(m.id);for(Models.Media m:api.mapPersonCredits(credits,follow.person.director,true))shows.remove(m.id);}
                List<Models.Media> fresh=PersonFollows.evaluate(follow,all,shows,today);
                if(PersonFollows.update(c,follow))for(Models.Media media:fresh)notifyPerson(c,follow.person,media,PersonFollows.noticeText(media,today));
            }catch(Exception e){failed=true;}
        }
        c.getSharedPreferences(STATE_PREFS,Context.MODE_PRIVATE).edit().putLong(LAST_CHECK,System.currentTimeMillis()).apply();
        return failed&&getRunAttemptCount()<2&&getInputData().getBoolean(INTERACTIVE,false)?Result.retry():Result.success();
    }

    static void ensureChannel(Context c){
        NotificationChannel channel=new NotificationChannel(CHANNEL,"Uscite seguite",NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Nuovi episodi, uscite dei film e arrivi in streaming dei titoli che segui");
        c.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    static boolean notificationsAllowed(Context c){
        ensureChannel(c);
        NotificationManager manager=c.getSystemService(NotificationManager.class);
        NotificationChannel channel=manager.getNotificationChannel(CHANNEL);
        return (Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            &&manager.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);
    }

    static void notify(Context c,ReleaseFollows.Follow follow,ReleaseFollows.Notice notice){
        if(!notificationsAllowed(c))return;
        Intent open=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(new Uri.Builder().scheme("streamwise").authority("media").appendPath(follow.media.id).build())
            .putExtra(MainActivity.EXTRA_OPEN_MEDIA,follow.media.json().toString());
        PendingIntent content=PendingIntent.getActivity(c,follow.media.id.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notifications)
            .setContentTitle(notice.title).setContentText(notice.text).setStyle(new Notification.BigTextStyle().bigText(notice.text))
            .setSubText(follow.series()?"Serie che segui":"Film che segui").setColor(0xFFB51F3D)
            .setContentIntent(content).setAutoCancel(true).setCategory(Notification.CATEGORY_RECOMMENDATION).setShowWhen(true);
        Bitmap poster=poster(follow.media.poster);
        if(poster!=null)builder.setLargeIcon(poster);
        // One notification per title and kind: a newer episode replaces the previous episode alert.
        c.getSystemService(NotificationManager.class).notify(follow.media.id,notice.kind.hashCode(),builder.build());
    }
    static void notifyPerson(Context c,Models.Person person,Models.Media media,String text){
        if(!notificationsAllowed(c))return;
        Intent open=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(new Uri.Builder().scheme("streamwise").authority("media").appendPath(media.id).build())
            .putExtra(MainActivity.EXTRA_OPEN_MEDIA,media.json().toString());
        PendingIntent content=PendingIntent.getActivity(c,(person.id+media.id).hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notifications)
            .setContentTitle(person.name).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setSubText(person.director?"Regista che segui":"Persona che segui").setColor(0xFFB51F3D)
            .setContentIntent(content).setAutoCancel(true).setCategory(Notification.CATEGORY_RECOMMENDATION).setShowWhen(true);
        Bitmap poster=poster(media.poster);
        if(poster!=null)builder.setLargeIcon(poster);
        c.getSystemService(NotificationManager.class).notify(PersonFollows.key(person),media.id.hashCode(),builder.build());
    }
    /** A notification the server sent for this account (new episode, release, credit), shown once on this phone. */
    static void notifyFromServer(Context c,org.json.JSONObject n){
        if(!notificationsAllowed(c))return;
        String mediaId=n.optString("mediaId");
        Intent open=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(new Uri.Builder().scheme("streamwise").authority("media").appendPath(mediaId).build())
            .putExtra(MainActivity.EXTRA_OPEN_MEDIA_ID,mediaId);
        PendingIntent content=PendingIntent.getActivity(c,n.optString("id").hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String text=n.optString("text");
        Notification.Builder builder=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notifications)
            .setContentTitle(n.optString("title")).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setSubText(n.optString("subtext")).setColor(0xFFB51F3D)
            .setContentIntent(content).setAutoCancel(true).setCategory(Notification.CATEGORY_RECOMMENDATION).setShowWhen(true);
        Bitmap poster=poster(n.optString("poster"));
        if(poster!=null)builder.setLargeIcon(poster);
        c.getSystemService(NotificationManager.class).notify(mediaId,n.optString("id").hashCode(),builder.build());
    }
    private static Bitmap poster(String url){
        if(url==null||url.isEmpty())return null;
        HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)new URL(url).openConnection();connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
            try(InputStream stream=connection.getInputStream()){return BitmapFactory.decodeStream(stream);}
        }catch(Exception e){return null;}finally{if(connection!=null)connection.disconnect();}
    }
}
