package io.github.hedgerock.throwablehighlighter;

import com.intellij.util.xmlb.XmlSerializer;
import junit.framework.TestCase;
import org.jdom.Element;

public final class ThrowableHighlightingSettingsTest extends TestCase {

    private final ThrowableHighlightingSettings settings =
            new ThrowableHighlightingSettings();

    public void testShouldUseThrowableCatchSourceByDefault() {
        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                settings.getCatchHighlightingSource()
        );
    }

    public void testShouldRestoreSerializedCatchSource() {
        settings.setCatchSource(CatchHighlightingSource.JAVA);

        Element serializedState = XmlSerializer.serialize(settings.getState());

        ThrowableHighlightingSettings.SettingsState restoredState =
                XmlSerializer.deserialize(
                        serializedState,
                        ThrowableHighlightingSettings.SettingsState.class
                );

        ThrowableHighlightingSettings restoredSettings =
                new ThrowableHighlightingSettings();

        restoredSettings.loadState(restoredState);

        assertEquals(
                CatchHighlightingSource.JAVA,
                restoredSettings.getCatchHighlightingSource()
        );
    }

    public void testShouldRestoreDefaultSourceFromEmptyState() {
        settings.setCatchSource(CatchHighlightingSource.JAVA);

        settings.loadState(new ThrowableHighlightingSettings.SettingsState());

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                settings.getCatchHighlightingSource()
        );
    }

    public void testShouldUseDefaultSourceWhenLoadedValueIsNull() {
        settings.setCatchSource(CatchHighlightingSource.JAVA);

        ThrowableHighlightingSettings.SettingsState state =
                new ThrowableHighlightingSettings.SettingsState();

        state.catchHighlightingSource = null;

        settings.loadState(state);

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                settings.getCatchHighlightingSource()
        );
    }

    public void testShouldKeepReturnedStateIndependentFromSettings() {
        settings.setCatchSource(CatchHighlightingSource.JAVA);

        ThrowableHighlightingSettings.SettingsState state =
                settings.getState();

        state.catchHighlightingSource = CatchHighlightingSource.THROWABLE_CATCH;

        assertEquals(
                CatchHighlightingSource.JAVA,
                settings.getCatchHighlightingSource()
        );
    }
}
