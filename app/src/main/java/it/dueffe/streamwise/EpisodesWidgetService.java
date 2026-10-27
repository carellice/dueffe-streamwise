package it.dueffe.streamwise;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class EpisodesWidgetService extends RemoteViewsService {
    static final String ACTION = "widgetAction";
    static final String OPEN = "open";
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) { return new Factory(this); }
    static final class Factory implements RemoteViewsFactory {
        private static final int ART_WIDTH = 560;
        private final Context context;
        private final Map<String, Bitmap> art = new HashMap<>();
        private List<Models.LibraryEntry> entries = new ArrayList<>();
        Factory(Context context) { this.context=context; }
        @Override public void onCreate() { }
        @Override public void onDataSetChanged() {
            entries = new LibraryStore(context).entriesByState("progress");
            entries.removeIf(entry -> !entry.media.isSeries());
            entries.sort((a,b) -> {
                int pinned = Boolean.compare(b.pinned,a.pinned);
                if(pinned!=0)return pinned;
                int started = Boolean.compare(b.watchedSeason!=null,a.watchedSeason!=null);
                if(started!=0)return started;
                return a.media.title.compareToIgnoreCase(b.media.title);
            });
        }
        @Override public void onDestroy() { entries.clear(); art.clear(); }
        @Override public int getCount() { return entries.size(); }
        @Override public RemoteViews getViewAt(int position) {
            if(position<0||position>=entries.size())return null;
            Models.LibraryEntry entry=entries.get(position);
            RemoteViews row=new RemoteViews(context.getPackageName(),R.layout.widget_episode_row);
            row.setTextViewText(R.id.widget_series, (entry.pinned?"📌 ":"")+entry.media.title);
            row.setTextViewText(R.id.widget_episode, "Prossimo · S"+entry.nextSeason+" E"+entry.nextEpisode);
            Bitmap artwork=artFor(entry.media);
            if(artwork!=null)row.setImageViewBitmap(R.id.widget_art,artwork);
            boolean reaction=context.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE)
                    .getBoolean(EpisodesWidget.reactionKey(entry.media.id,entry.nextSeason,entry.nextEpisode),false);
            row.setViewVisibility(R.id.widget_seen,reaction?View.GONE:View.VISIBLE);
            row.setViewVisibility(R.id.widget_reactions,reaction?View.VISIBLE:View.GONE);
            // Tapping the card opens the series; the buttons inside it take precedence for marking.
            row.setOnClickFillInIntent(R.id.widget_card, new Intent().putExtra(ACTION, OPEN).putExtra(MainActivity.EXTRA_OPEN_MEDIA, entry.media.json().toString()));
            Intent action=new Intent().putExtra("mediaId",entry.media.id).putExtra("season",entry.nextSeason).putExtra("episode",entry.nextEpisode);
            row.setOnClickFillInIntent(R.id.widget_seen, action);
            row.setOnClickFillInIntent(R.id.widget_like,new Intent(action).putExtra("liked",true));
            row.setOnClickFillInIntent(R.id.widget_dislike,new Intent(action).putExtra("liked",false));
            return row;
        }
        /** Series artwork, scaled down and cached on disk; runs on the widget's binder thread, so the network is allowed. */
        private Bitmap artFor(Models.Media media) {
            String url=media.backdrop.isEmpty()?media.poster:media.backdrop;
            if(url.isEmpty())return null;
            Bitmap cached=art.get(url);
            if(cached!=null)return cached;
            File file=new File(new File(context.getCacheDir(),"widget-art"),Integer.toHexString(url.hashCode())+".jpg");
            BitmapFactory.Options options=new BitmapFactory.Options();
            options.inPreferredConfig=Bitmap.Config.RGB_565;
            Bitmap bitmap=file.exists()?BitmapFactory.decodeFile(file.getPath(),options):null;
            if(bitmap==null)try{
                HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
                connection.setConnectTimeout(5000);connection.setReadTimeout(8000);
                Bitmap downloaded;
                try(InputStream input=connection.getInputStream()){downloaded=BitmapFactory.decodeStream(input,null,options);}
                finally{connection.disconnect();}
                if(downloaded!=null){
                    int height=Math.max(1,Math.round(ART_WIDTH*downloaded.getHeight()/(float)downloaded.getWidth()));
                    bitmap=downloaded.getWidth()>ART_WIDTH?Bitmap.createScaledBitmap(downloaded,ART_WIDTH,height,true):downloaded;
                    File parent=file.getParentFile();
                    if(parent!=null&&(parent.isDirectory()||parent.mkdirs()))
                        try(FileOutputStream out=new FileOutputStream(file)){bitmap.compress(Bitmap.CompressFormat.JPEG,85,out);}
                }
            }catch(Exception ignored){}
            if(bitmap!=null)art.put(url,bitmap);
            return bitmap;
        }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return entries.get(position).media.tmdbId; }
        @Override public boolean hasStableIds() { return true; }
    }
}
