package it.dueffe.streamwise;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** Persistent, user-selected television reminders. No network is required at delivery time. */
public final class TvReminderReceiver extends BroadcastReceiver {
    private static final String PREFS="tv-reminders", CHANNEL="tv-programmes", FIRE="it.dueffe.streamwise.TV_REMINDER";
    static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static boolean exactAllowed(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static boolean notificationsAllowed(Context c){
        ensureChannel(c);
        return (Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            &&c.getSystemService(NotificationManager.class).areNotificationsEnabled()
            &&c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    static void ensureChannel(Context c){c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Promemoria Guida TV",NotificationManager.IMPORTANCE_HIGH));}
    static int minutes(Context c,String key){try{return new JSONObject(prefs(c).getString(key,"{}")).optInt("minutes",-1);}catch(Exception e){return -1;}}
    static PendingIntent alarmIntent(Context c,String key){
        Intent intent=new Intent(c,TvReminderReceiver.class).setAction(FIRE).setData(new Uri.Builder().scheme("streamwise").authority("tv-reminder").appendPath(key).build()).putExtra("key",key);
        return PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static long trigger(TvGuideRepository.Programme p,int minutes){return p.start.minusSeconds(minutes*60L).toEpochMilli();}
    static void save(Context c,TvGuideRepository.Programme p,int minutes)throws Exception{
        if(minutes<1||minutes>1440||trigger(p,minutes)<=System.currentTimeMillis())throw new IllegalArgumentException("Scegli un anticipo più breve: l’orario del promemoria è già passato.");
        if(!exactAllowed(c)||!notificationsAllowed(c))throw new IllegalStateException("Abilita notifiche e promemoria nelle impostazioni.");
        JSONObject record=new JSONObject().put("title",p.title).put("channel",p.channel).put("start",p.start.toEpochMilli()).put("end",p.end.toEpochMilli()).put("minutes",minutes).put("trigger",trigger(p,minutes));
        schedule(c,p.key(),record);
        if(!prefs(c).edit().putString(p.key(),record.toString()).commit()){cancel(c,p.key());throw new IllegalStateException("Impossibile salvare il promemoria.");}
    }
    static void schedule(Context c,String key,JSONObject record){
        AlarmManager manager=c.getSystemService(AlarmManager.class);
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,record.optLong("trigger"),alarmIntent(c,key));
    }
    static void cancel(Context c,String key){PendingIntent intent=alarmIntent(c,key);c.getSystemService(AlarmManager.class).cancel(intent);intent.cancel();prefs(c).edit().remove(key).commit();}
    static void restore(Context c){
        for(Map.Entry<String,?> entry:prefs(c).getAll().entrySet())try{
            JSONObject record=new JSONObject((String)entry.getValue());
            if(record.optLong("start")<=System.currentTimeMillis())cancel(c,entry.getKey());
            else if(exactAllowed(c)){
                // A reminder missed during a restart is still useful while the programme has not started.
                record.put("trigger",Math.max(record.optLong("trigger"),System.currentTimeMillis()+1000));schedule(c,entry.getKey(),record);
            }
        }catch(Exception ignored){}
    }
    @Override public void onReceive(Context context,Intent intent){
        if(!FIRE.equals(intent.getAction())){restore(context);return;}
        String key=intent.getStringExtra("key");if(key==null)return;
        try{
            String raw=prefs(context).getString(key,null);if(raw==null)return;
            JSONObject record=new JSONObject(raw);prefs(context).edit().remove(key).commit();
            if(record.optLong("end")<=System.currentTimeMillis()||!notificationsAllowed(context))return;
            ZonedDateTime start=Instant.ofEpochMilli(record.getLong("start")).atZone(TvGuideRepository.ROME);
            Intent open=new Intent(context,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .setData(new Uri.Builder().scheme("streamwise").authority("tv-guide").appendPath(key).build()).putExtra("tv-guide-date",start.toLocalDate().toString());
            PendingIntent content=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            String text=record.getString("channel")+" · alle "+start.format(DateTimeFormatter.ofPattern("HH:mm"));
            Notification notification=new Notification.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_tv_guide).setContentTitle(record.getString("title"))
                .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(content).setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER).setShowWhen(true).build();
            context.getSystemService(NotificationManager.class).notify(key,0,notification);
        }catch(Exception ignored){}
    }
}
