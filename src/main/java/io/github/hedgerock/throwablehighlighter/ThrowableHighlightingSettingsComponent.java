package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.FormBuilder;
import org.jetbrains.annotations.NotNull;

import javax.swing.DefaultListCellRenderer;
import javax.swing.JComponent;
import javax.swing.ListCellRenderer;
import javax.swing.JPanel;
import java.util.Objects;

public final class ThrowableHighlightingSettingsComponent {

    private final ComboBox<CatchHighlightingSource> catchSourceComboBox =
            new ComboBox<>(CatchHighlightingSource.values());

    private final JPanel panel;

    public ThrowableHighlightingSettingsComponent() {
        catchSourceComboBox.setRenderer(createSourceRenderer());

        JBLabel description = new JBLabel(
                "<html>"
                        + "Throwable catch uses the color scheme attributes.<br>"
                        + "It inherits Throwable class unless configured separately.<br><br>"
                        + "Java highlighting keeps standard Java highlighting.<br><br>"
                        + "Configure attributes under:<br>"
                        + "Editor | Color Scheme | Throwable Highlighter.<br><br>"
                        + "The color scheme preview always shows Throwable catch attributes.<br>"
                        + "This choice applies to all projects."
                        + "</html>"
        );

        panel = FormBuilder.createFormBuilder()
                .addLabeledComponent(
                        "Catch highlighting source:",
                        catchSourceComboBox
                )
                .addComponent(description)
                .addComponentFillVertically(new JPanel(), 0)
                .getPanel();
    }

    public @NotNull JPanel getPanel() {
        return panel;
    }

    public @NotNull JComponent getPreferredFocusedComponent() {
        return catchSourceComboBox;
    }

    public @NotNull CatchHighlightingSource getCatchHighlightingSource() {
        return Objects.requireNonNull(
                (CatchHighlightingSource) catchSourceComboBox.getSelectedItem()
        );
    }

    public void setCatchHighlightingSource(
            @NotNull CatchHighlightingSource source
    ) {
        catchSourceComboBox.setSelectedItem(source);
    }

    private static @NotNull ListCellRenderer<CatchHighlightingSource>
    createSourceRenderer() {
        DefaultListCellRenderer renderer = new DefaultListCellRenderer();

        return (list, source, index, selected, focused) -> {
            renderer.getListCellRendererComponent(
                    list,
                    source,
                    index,
                    selected,
                    focused
            );

            renderer.setText(
                    source == null ? "" : switch (source) {
                        case THROWABLE_CATCH -> "Throwable catch";
                        case JAVA -> "Java highlighting";
                    }
            );

            return renderer;
        };
    }
}
