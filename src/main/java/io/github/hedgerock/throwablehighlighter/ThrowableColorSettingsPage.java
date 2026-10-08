package io.github.hedgerock.throwablehighlighter;

import com.intellij.ide.highlighter.JavaFileHighlighter;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.fileTypes.SyntaxHighlighter;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.openapi.options.colors.ColorDescriptor;
import com.intellij.openapi.options.colors.ColorSettingsPage;
import com.intellij.openapi.util.NlsContexts;
import org.jetbrains.annotations.NonNls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.*;
import java.util.Map;

public final class ThrowableColorSettingsPage implements ColorSettingsPage {

    private static final AttributesDescriptor[] DESCRIPTIONS = {
            new AttributesDescriptor(
                    "Throwable class",
                    ThrowableHighlighting.THROWABLE_CLASS
            ),
            new AttributesDescriptor(
                    "Throwable import",
                    ThrowableHighlighting.THROWABLE_IMPORT
            ),
            new AttributesDescriptor(
                    "Throwable catch",
                    ThrowableHighlighting.THROWABLE_CATCH
            )
    };

    @Override
    public @Nullable Icon getIcon() {
        return null;
    }

    @Override
    public @NotNull SyntaxHighlighter getHighlighter() {
        return new JavaFileHighlighter();
    }

    @Override
    public @NonNls @NotNull String getDemoText() {
        return """
            import java.io.<throwableImport>IOException</throwableImport>;

            public final class <throwable>ApplicationException</throwable>
                    extends <throwable>RuntimeException</throwable> {
            }

            public final class Example {

                private <throwable>ApplicationException</throwable> exception;

                public void execute() throws <throwable>ApplicationException</throwable> {
                    try {
                        throw new <throwable>ApplicationException</throwable>();
                    } catch (<throwableCatch>ApplicationException</throwableCatch> exception) {
                        // Handle exception
                    }
                }
            }
            """;
    }

    @Override
    public @NotNull Map<String, TextAttributesKey> getAdditionalHighlightingTagToDescriptorMap() {
        return Map.of(
                "throwable", ThrowableHighlighting.THROWABLE_CLASS,
                "throwableImport", ThrowableHighlighting.THROWABLE_IMPORT,
                "throwableCatch", ThrowableHighlighting.THROWABLE_CATCH
        );
    }

    @Override
    public AttributesDescriptor @NotNull [] getAttributeDescriptors() {
        return DESCRIPTIONS;
    }

    @Override
    public ColorDescriptor @NotNull [] getColorDescriptors() {
        return ColorDescriptor.EMPTY_ARRAY;
    }

    @Override
    public @NlsContexts.ConfigurableName @NotNull String getDisplayName() {
        return "Throwable Highlighter";
    }
}
