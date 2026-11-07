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

    public void testShouldLoadLegacyJavaCatchSource() {
        settings.setHighlightingSource(
                ThrowableHighlightingContext.CLASS,
                ThrowableHighlightingSource.JAVA
        );

        loadLegacyCatchSource("JAVA");

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            assertEquals(
                    context.name(),
                    context == ThrowableHighlightingContext.CATCH
                            ? ThrowableHighlightingSource.JAVA
                            : ThrowableHighlightingSource.PLUGIN,
                    settings.getHighlightingSource(context)
            );
        }
    }

    public void testShouldLoadLegacyThrowableCatchSource() {
        settings.setCatchSource(CatchHighlightingSource.JAVA);

        loadLegacyCatchSource("THROWABLE_CATCH");

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                settings.getHighlightingSource(ThrowableHighlightingContext.CATCH)
        );
    }

    public void testShouldRestoreSourcesIndependentlyAfterSerialization() {
        for (ThrowableHighlightingContext selected : ThrowableHighlightingContext.values()) {
            ThrowableHighlightingSettings original = new ThrowableHighlightingSettings();
            original.setHighlightingSource(selected, ThrowableHighlightingSource.JAVA);

            Element serializedState = XmlSerializer.serialize(original.getState());
            ThrowableHighlightingSettings restored = new ThrowableHighlightingSettings();
            restored.loadState(XmlSerializer.deserialize(
                    serializedState,
                    ThrowableHighlightingSettings.SettingsState.class
            ));

            for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
                assertEquals(
                        selected.name() + " / " + context.name(),
                        context == selected
                                ? ThrowableHighlightingSource.JAVA
                                : ThrowableHighlightingSource.PLUGIN,
                        restored.getHighlightingSource(context)
                );
            }
        }
    }

    private void loadLegacyCatchSource(String source) {
        Element state = new Element("SettingsState").addContent(
                new Element("option")
                        .setAttribute("name", "catchHighlightingSource")
                        .setAttribute("value", source)
        );
        settings.loadState(XmlSerializer.deserialize(
                state,
                ThrowableHighlightingSettings.SettingsState.class
        ));
    }
}
