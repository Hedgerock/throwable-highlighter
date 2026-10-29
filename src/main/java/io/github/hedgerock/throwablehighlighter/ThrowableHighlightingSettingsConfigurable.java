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

            component.setCatchHighlightingSource(
                    ThrowableHighlightingSettings.getInstance()
                            .getCatchHighlightingSource()
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

        return component != null
                && component.getCatchHighlightingSource()
                != ThrowableHighlightingSettings.getInstance()
                .getCatchHighlightingSource();
    }

    @Override
    public void apply() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;

        if (component == null) {
            return;
        }

        CatchHighlightingSource selectedSource =
                component.getCatchHighlightingSource();

        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();

        if (settings.getCatchHighlightingSource() == selectedSource) {
            return;
        }

        settings.setCatchSource(selectedSource);

        for (Project project : ProjectManager.getInstance().getOpenProjects()) {
            if (!project.isDisposed()) {
                DaemonCodeAnalyzer.getInstance(project).restart(
                        "Throwable Highlighter: catch highlighting source changed"
                );
            }
        }
    }

    @Override
    public void reset() {
        ThrowableHighlightingSettingsComponent component = settingsComponent;

        if (component != null) {
            component.setCatchHighlightingSource(
                    ThrowableHighlightingSettings.getInstance()
                            .getCatchHighlightingSource()
            );
        }
    }

    @Override
    public void disposeUIResources() {
        settingsComponent = null;
    }
}
