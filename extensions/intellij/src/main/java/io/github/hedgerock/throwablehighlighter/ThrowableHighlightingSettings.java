package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.RoamingType;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.EnumMap;
import java.util.Map;

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

    private volatile Map<ThrowableHighlightingContext, ThrowableHighlightingSource> sources =
            readSources(new SettingsState());

    public static @NotNull ThrowableHighlightingSettings getInstance() {
        return ApplicationManager.getApplication()
                .getService(ThrowableHighlightingSettings.class);
    }

    public @NotNull ThrowableHighlightingSource getHighlightingSource(
            @NotNull ThrowableHighlightingContext context
    ) {
        return sources.getOrDefault(context, ThrowableHighlightingSource.PLUGIN);
    }

    synchronized void setHighlightingSource(
            @NotNull ThrowableHighlightingContext context,
            @NotNull ThrowableHighlightingSource source
    ) {
        EnumMap<ThrowableHighlightingContext, ThrowableHighlightingSource> updatedSources =
                new EnumMap<>(sources);

        updatedSources.put(context, source);
        sources = Map.copyOf(updatedSources);
    }

    public @NotNull CatchHighlightingSource getCatchHighlightingSource() {
        return toCatchSource(getHighlightingSource(ThrowableHighlightingContext.CATCH));
    }

    public void setCatchSource(@NotNull CatchHighlightingSource source) {
        setHighlightingSource(ThrowableHighlightingContext.CATCH, fromCatchSource(source));
    }

    @Override
    public @NotNull SettingsState getState() {
        Map<ThrowableHighlightingContext, ThrowableHighlightingSource> snapshot = sources;
        SettingsState state = new SettingsState();

        state.classHighlightingSource = snapshot.get(ThrowableHighlightingContext.CLASS);
        state.importHighlightingSource = snapshot.get(ThrowableHighlightingContext.IMPORT);
        state.catchHighlightingSource = toCatchSource(snapshot.get(ThrowableHighlightingContext.CATCH));
        state.throwsHighlightingSource = snapshot.get(ThrowableHighlightingContext.THROWS);
        state.javadocHighlightingSource = snapshot.get(ThrowableHighlightingContext.JAVADOC);

        return state;
    }

    @Override
    public synchronized void loadState(@NotNull SettingsState settingsState) {
        sources = readSources(settingsState);
    }

    private static Map<ThrowableHighlightingContext, ThrowableHighlightingSource> readSources(
            SettingsState state
    ) {
        return Map.of(
                ThrowableHighlightingContext.CLASS, sourceOrDefault(state.classHighlightingSource),
                ThrowableHighlightingContext.IMPORT, sourceOrDefault(state.importHighlightingSource),
                ThrowableHighlightingContext.CATCH, fromCatchSource(state.catchHighlightingSource),
                ThrowableHighlightingContext.THROWS, sourceOrDefault(state.throwsHighlightingSource),
                ThrowableHighlightingContext.JAVADOC, sourceOrDefault(state.javadocHighlightingSource)
        );
    }

    private static @NotNull ThrowableHighlightingSource sourceOrDefault(
       @Nullable ThrowableHighlightingSource source
    ) {
        return source == null ? ThrowableHighlightingSource.PLUGIN : source;
    }

    private static @NotNull ThrowableHighlightingSource fromCatchSource(
            @Nullable CatchHighlightingSource source
    ) {
        return source == CatchHighlightingSource.JAVA
                ? ThrowableHighlightingSource.JAVA
                : ThrowableHighlightingSource.PLUGIN;
    }

    private static @NotNull CatchHighlightingSource toCatchSource(
            @Nullable ThrowableHighlightingSource source
    ) {
        return source == ThrowableHighlightingSource.JAVA
                ? CatchHighlightingSource.JAVA
                : CatchHighlightingSource.THROWABLE_CATCH;
    }

    public static final class SettingsState {

        public @Nullable ThrowableHighlightingSource classHighlightingSource =
                ThrowableHighlightingSource.PLUGIN;
        public @Nullable ThrowableHighlightingSource importHighlightingSource =
                ThrowableHighlightingSource.PLUGIN;
        public @Nullable CatchHighlightingSource catchHighlightingSource =
                CatchHighlightingSource.THROWABLE_CATCH;
        public @Nullable ThrowableHighlightingSource throwsHighlightingSource =
                ThrowableHighlightingSource.PLUGIN;
        public @Nullable ThrowableHighlightingSource javadocHighlightingSource =
                ThrowableHighlightingSource.PLUGIN;
    }

    @NotNull Map<ThrowableHighlightingContext, ThrowableHighlightingSource> getHighlightingSources() {
        return sources;
    }

    synchronized boolean updateHighlightingSources(
            @NotNull Map<ThrowableHighlightingContext, ThrowableHighlightingSource> selectedSources
    ) {
        Map<ThrowableHighlightingContext, ThrowableHighlightingSource> snapshot = Map.copyOf(selectedSources);

        if (snapshot.size() != ThrowableHighlightingContext.values().length) {
            throw new IllegalArgumentException("A source is required for each highlighting context.");
        }

        if (sources.equals(snapshot)) {
            return false;
        }

        sources = snapshot;
        return true;
    }
}
