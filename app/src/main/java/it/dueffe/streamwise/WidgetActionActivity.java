package it.dueffe.streamwise;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Invisible trampoline for widget list taps: a list can only have one click template, so this
 * either opens the tapped series in the app or forwards an episode action to the widget receiver.
 */
public final class WidgetActionActivity extends Activity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent source=getIntent();
        if(EpisodesWidgetService.OPEN.equals(source.getStringExtra(EpisodesWidgetService.ACTION))){
            startActivity(new Intent(this,MainActivity.class)
                    .putExtra(MainActivity.EXTRA_OPEN_MEDIA,source.getStringExtra(MainActivity.EXTRA_OPEN_MEDIA))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));
        } else if(source.getExtras()!=null){
            sendBroadcast(new Intent(this,EpisodesWidget.class).setAction(EpisodesWidget.MARK).putExtras(source.getExtras()));
        }
        finish();
        overridePendingTransition(0,0);
    }
}
