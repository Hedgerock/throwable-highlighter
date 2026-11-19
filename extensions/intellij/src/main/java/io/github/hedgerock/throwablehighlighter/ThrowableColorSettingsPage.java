package io.github.hedgerock.throwablehighlighter;

import com.intellij.ide.highlighter.JavaFileHighlighter;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.fileTypes.SyntaxHighlighter;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.openapi.options.colors.ColorDescriptor;
import com.intellij.openapi.options.colors.ColorSettingsPage;
import com.intellij.openapi.util.NlsContexts;
import java.util.Map;
import java.util.stream.Collectors;
import javax.swing.*;
import org.jetbrains.annotations.NonNls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class ThrowableColorSettingsPage implements ColorSettingsPage {

    private static final AttributesDescriptor[] ATTRIBUTES_DESCRIPTORS =
            ThrowableHighlightingStyles.allStyles().stream()
                    .map(styleDefinition ->
                            new AttributesDescriptor(styleDefinition.settingsPath(), styleDefinition.attributesKey()))
                    .toArray(AttributesDescriptor[]::new);

    private static final Map<String, TextAttributesKey> HIGHLIGHTING_TAGS =
            ThrowableHighlightingStyles.allStyles().stream()
                    .filter(styleDefinition -> styleDefinition.previewTag() != null)
                    .collect(Collectors.toUnmodifiableMap(
                            ThrowableHighlightingStyles.StyleDefinition::previewTag,
                            ThrowableHighlightingStyles.StyleDefinition::attributesKey));

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

        final class <throwableChecked>CheckedException</throwableChecked>
                extends <throwableChecked>IOException</throwableChecked> {
        }

        public final class <throwableRuntimeException>ApplicationException</throwableRuntimeException>
                extends <throwableRuntimeException>RuntimeException</throwableRuntimeException> {
        }

        final class <throwableError>ApplicationError</throwableError>
                extends <throwableError>Error</throwableError> {
        }

        public final class Example {

            private <throwableChecked>CheckedException</throwableChecked> checkedException;
            private <throwableRuntimeException>ApplicationException</throwableRuntimeException> exception;
            private <throwableError>ApplicationError</throwableError> error;

            /**
             * Executes the operation.
             *
             * @throws <throwableJavadoc>ApplicationException</throwableJavadoc> if execution fails
             * @exception java.lang.<throwableJavadoc>IllegalStateException</throwableJavadoc> if the state is invalid
             */
            public void execute() throws <throwableThrows>ApplicationException</throwableThrows> {
                try {
                    if (checkedException != null) {
                        throw checkedException;
                    }

                    throw new <throwableRuntimeException>ApplicationException</throwableRuntimeException>();
                } catch (<throwableCatchChecked>CheckedException</throwableCatchChecked>
                        | <throwableCatchRuntimeException>ApplicationException</throwableCatchRuntimeException> exception) {
                    // Handle exception
                } catch (<throwableCatchError>ApplicationError</throwableCatchError> error) {
                    // Handle error
                }
            }
        }
        """;
    }

    @Override
    public @NotNull Map<String, TextAttributesKey> getAdditionalHighlightingTagToDescriptorMap() {
        return HIGHLIGHTING_TAGS;
    }

    @Override
    public AttributesDescriptor @NotNull [] getAttributeDescriptors() {
        return ATTRIBUTES_DESCRIPTORS;
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
