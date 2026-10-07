package it.dueffe.streamwise;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

public final class EpisodesWidgetService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) { return new Factory(this); }
    static final class Factory implements RemoteViewsFactory {
        private final Context context;
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
        @Override public void onDestroy() { entries.clear(); }
        @Override public int getCount() { return entries.size(); }
        @Override public RemoteViews getViewAt(int position) {
            if(position<0||position>=entries.size())return null;
            Models.LibraryEntry entry=entries.get(position);
            RemoteViews row=new RemoteViews(context.getPackageName(),R.layout.widget_episode_row);
            row.setTextViewText(R.id.widget_series, (entry.pinned?"📌 ":"")+entry.media.title);
            row.setTextViewText(R.id.widget_episode, "Prossimo: S"+entry.nextSeason+" · E"+entry.nextEpisode);
            boolean reaction=context.getSharedPreferences("streamwise-native",Context.MODE_PRIVATE)
                    .getBoolean(EpisodesWidget.reactionKey(entry.media.id,entry.nextSeason,entry.nextEpisode),false);
            row.setViewVisibility(R.id.widget_seen,reaction?View.GONE:View.VISIBLE);
            row.setViewVisibility(R.id.widget_reactions,reaction?View.VISIBLE:View.GONE);
            Intent action=new Intent().putExtra("mediaId",entry.media.id).putExtra("season",entry.nextSeason).putExtra("episode",entry.nextEpisode);
            row.setOnClickFillInIntent(R.id.widget_seen, action);
            row.setOnClickFillInIntent(R.id.widget_like,new Intent(action).putExtra("liked",true));
            row.setOnClickFillInIntent(R.id.widget_dislike,new Intent(action).putExtra("liked",false));
            return row;
        }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return entries.get(position).media.tmdbId; }
        @Override public boolean hasStableIds() { return true; }
    }
}
