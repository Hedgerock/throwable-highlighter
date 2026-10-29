package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.RoamingType;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

@Service(Service.Level.APP)
@State(
        name = "io.github.hedgerock.throwablehighlighter.ThrowableHighlightingSettings",
        storages = @Storage(
                value = "throwable-highlighter.xml",
                roamingType = RoamingType.DISABLED
        )
)
public final class ThrowableHighlightingSettings
        implements PersistentStateComponent<ThrowableHighlightingSettings.SettingsState> {

    private volatile CatchHighlightingSource catchSource =
            CatchHighlightingSource.THROWABLE_CATCH;

    public static @NotNull ThrowableHighlightingSettings getInstance() {
        return ApplicationManager.getApplication()
                .getService(ThrowableHighlightingSettings.class);
    }

    public @NotNull CatchHighlightingSource getCatchHighlightingSource() {
        return catchSource;
    }

    public void setCatchSource(@NotNull CatchHighlightingSource source) {
        catchSource = source;
    }

    @Override
    public @NotNull SettingsState getState() {
        SettingsState state = new SettingsState();
        state.catchHighlightingSource = catchSource;

        return state;
    }

    @Override
    public void loadState(@NotNull SettingsState settingsState) {
        CatchHighlightingSource source = settingsState.catchHighlightingSource;

        catchSource = source == null
                ? CatchHighlightingSource.THROWABLE_CATCH
                : source;
    }

    public static final class SettingsState {

        public @Nullable CatchHighlightingSource catchHighlightingSource =
                CatchHighlightingSource.THROWABLE_CATCH;
    }
}
