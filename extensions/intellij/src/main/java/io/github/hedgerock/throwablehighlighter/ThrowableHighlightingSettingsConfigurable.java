package io.github.hedgerock.throwablehighlighter;

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer;
import com.intellij.openapi.options.Configurable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectManager;
import com.intellij.openapi.util.NlsContexts;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.JComponent;

public final class ThrowableHighlightingSettingsConfigurable
        implements Configurable {

    private @Nullable ThrowableHighlightingSettingsComponent settingsComponent;

    @Override
    public @NlsContexts.ConfigurableName @NotNull String getDisplayName() {
        return "Throwable Highlighter";
    }

    @Override
    public @NotNull JComponent createComponent() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;
        if (component == null) {
            component = new ThrowableHighlightingSettingsComponent();
            component.setSelectedSources(
                    ThrowableHighlightingSettings.getInstance().getHighlightingSources()
            );
            settingsComponent = component;
        }

        return component.getPanel();
    }

    @Override
    public @Nullable JComponent getPreferredFocusedComponent() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;

        return component == null
                ? null
                : component.getPreferredFocusedComponent();
    }

    @Override
    public boolean isModified() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;
        return component != null && !component.getSelectedSources().equals(
                ThrowableHighlightingSettings.getInstance().getHighlightingSources()
        );
    }

    @Override
    public void apply() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;
        if (component == null) {
            return;
        }

        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();
        if (!settings.updateHighlightingSources(component.getSelectedSources())) {
            return;
        }

        for (Project project : ProjectManager.getInstance().getOpenProjects()) {
            if (!project.isDisposed()) {
                DaemonCodeAnalyzer.getInstance(project).restart(
                        "Throwable Highlighter: highlighting sources changed"
                );
            }
        }
    }

    @Override
    public void reset() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;
        if (component != null) {
            component.setSelectedSources(
                    ThrowableHighlightingSettings.getInstance().getHighlightingSources()
            );
        }
    }

    @Override
    public void disposeUIResources() {
        settingsComponent = null;
    }
}
