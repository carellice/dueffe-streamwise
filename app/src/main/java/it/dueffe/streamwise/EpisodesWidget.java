package it.dueffe.streamwise;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import android.widget.Toast;
import java.util.List;

public final class EpisodesWidget extends AppWidgetProvider {
    static final String MARK = "it.dueffe.streamwise.widget.MARK";
    static final String REFRESH = "it.dueffe.streamwise.widget.REFRESH";
    static String reactionKey(String id, int season, int episode) { return "widget-reaction-"+id+"-"+season+"-"+episode; }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, EpisodesWidget.class));
        for (int id : ids) update(context, manager, id);
        if (ids.length > 0) manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_episodes);
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_episodes);
        Intent adapter = new Intent(context, EpisodesWidgetService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        adapter.setData(Uri.parse("streamwise-widget://episodes/"+id));
        // Rows come from the service so each one (with its artwork) is built on a background thread.
        views.setRemoteAdapter(R.id.widget_episodes, adapter);
        views.setEmptyView(R.id.widget_episodes, R.id.widget_empty);
        views.setOnClickPendingIntent(R.id.widget_title, PendingIntent.getActivity(context, id,
                new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        views.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, id,
                new Intent(context, EpisodesWidget.class).setAction(REFRESH), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        views.setPendingIntentTemplate(R.id.widget_episodes, PendingIntent.getActivity(context, id,
                new Intent(context, WidgetActionActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));
        manager.updateAppWidget(id, views);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) { update(context, manager, id); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) { updateAll(context); return; }
        if (!MARK.equals(intent.getAction())) return;
        String mediaId = intent.getStringExtra("mediaId");
        int season = intent.getIntExtra("season", -1), episode = intent.getIntExtra("episode", -1);
        Models.LibraryEntry selected = find(new LibraryStore(context), mediaId, season, episode);
        if (selected == null) { updateAll(context); return; }
        PendingResult result = goAsync();
        // Only one metadata request is needed; keep it within the broadcast lifetime.
        new Thread(() -> {
            try {
                List<Models.Season> seasons = new TmdbApi(BuildConfig.TMDB_API_KEY, 3000).seasons(selected.media, false);
                for (Models.Season item : seasons) for (int n=1;n<=item.episodeCount;n++) {
                    Models.Episode ep = new Models.Episode(); ep.season=item.number; ep.number=n; item.episodes.add(ep);
                }
                new Handler(Looper.getMainLooper()).post(() -> {
                    try {
                        LibraryStore store = new LibraryStore(context);
                        Models.LibraryEntry current = find(store, mediaId, season, episode);
                        if (current == null) return;
                        List<Models.Episode> all = LibraryStore.flatten(seasons);
                        Models.Episode next = null;
                        for (Models.Episode ep : all) if(ep.season==season && ep.number==episode) next=ep;
                        if (next == null) { toast(context, "Episodio non disponibile. Aggiorna la serie nell’app."); return; }
                        Boolean liked = intent.hasExtra("liked") ? intent.getBooleanExtra("liked", false) : null;
                        if (next == all.get(all.size()-1) && liked == null && current.liked == null) {
                            context.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE).edit()
                                    .putBoolean(reactionKey(mediaId, season, episode), true).apply();
                            toast(context, "Ultimo episodio: scegli Mi piace o Non mi piace nel widget.");
                            return;
                        }
                        store.markEpisode(current.media, next, seasons, liked);
                        context.getSharedPreferences("streamwise-native", Context.MODE_PRIVATE).edit()
                                .remove(reactionKey(mediaId, season, episode)).apply();
                        toast(context, "Episodio segnato come visto");
                    } finally { updateAll(context); result.finish(); }
                });
            } catch (Exception error) {
                new Handler(Looper.getMainLooper()).post(() -> {
                    toast(context, "Non riesco ad aggiornare l’episodio. Controlla la connessione e riprova.");
                    result.finish();
                });
            }
        }, "widget-episode").start();
    }
    static Models.LibraryEntry find(LibraryStore store, String id, int season, int episode) {
        for (Models.LibraryEntry entry : store.all()) if(entry.media.id.equals(id) && entry.media.isSeries()
                && "progress".equals(entry.state) && entry.nextSeason==season && entry.nextEpisode==episode) return entry;
        return null;
    }
    private static void toast(Context context, String text) { Toast.makeText(context, text, Toast.LENGTH_LONG).show(); }
}
