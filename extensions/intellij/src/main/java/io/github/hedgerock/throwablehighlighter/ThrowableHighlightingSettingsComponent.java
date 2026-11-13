package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.FormBuilder;
import org.jetbrains.annotations.NotNull;

import javax.swing.DefaultListCellRenderer;
import javax.swing.JComponent;
import javax.swing.ListCellRenderer;
import javax.swing.JPanel;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

public final class ThrowableHighlightingSettingsComponent {

    private final EnumMap<ThrowableHighlightingContext, ComboBox<ThrowableHighlightingSource>> sourceComboBoxes =
            new EnumMap<>(ThrowableHighlightingContext.class);
    private final JPanel panel;

    public ThrowableHighlightingSettingsComponent() {
        FormBuilder formBuilder = FormBuilder.createFormBuilder();

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            ComboBox<ThrowableHighlightingSource> comboBox =
                    new ComboBox<>(ThrowableHighlightingSource.values());
            comboBox.setName(context.name());
            comboBox.setRenderer(createSourceRenderer(context));

            sourceComboBoxes.put(context, comboBox);
            formBuilder.addLabeledComponent(context.getDisplayName() + ":", comboBox);
        }

        JBLabel description = new JBLabel("""
                <html>
                Choose a highlighting source for each context.<br>
                Java highlighting keeps the IDE's standard highlighting.<br><br>
                Configure plugin attributes under:<br>
                Editor | Color Scheme | Throwable Highlighter.<br><br>
                The color scheme preview shows the plugin's attributes.<br>
                These choices apply to all projects.
                </html>
                """);

        panel = formBuilder
                .addComponent(description)
                .addComponentFillVertically(new JPanel(), 0)
                .getPanel();
    }

    public @NotNull JPanel getPanel() {
        return panel;
    }

    public @NotNull JComponent getPreferredFocusedComponent() {
        return Objects.requireNonNull(sourceComboBoxes.get(ThrowableHighlightingContext.CLASS));
    }

    @NotNull Map<ThrowableHighlightingContext, ThrowableHighlightingSource> getSelectedSources() {
        EnumMap<ThrowableHighlightingContext, ThrowableHighlightingSource> selectedSources =
                new EnumMap<>(ThrowableHighlightingContext.class);

        sourceComboBoxes.forEach((context, comboBox) ->
                selectedSources.put(
                        context,
                        Objects.requireNonNull((ThrowableHighlightingSource) comboBox.getSelectedItem())
                )
        );

        return selectedSources;
    }

    void setSelectedSources(
            @NotNull Map<ThrowableHighlightingContext, ThrowableHighlightingSource> sources
    ) {
        sourceComboBoxes.forEach((context, comboBox) ->
                comboBox.setSelectedItem(sources.get(context))
        );
    }

    private static ListCellRenderer<ThrowableHighlightingSource> createSourceRenderer(
            ThrowableHighlightingContext context
    ) {
        DefaultListCellRenderer renderer = new DefaultListCellRenderer();
        return (list, source, index, selected, focused) -> {
            renderer.getListCellRendererComponent(list, source, index, selected, focused);
            renderer.setText(source == null ? "" : switch (source) {
                case PLUGIN -> context.getDisplayName();
                case JAVA -> "Java highlighting";
            });
            return renderer;
        };
    }
}
