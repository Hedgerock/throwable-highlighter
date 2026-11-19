package io.github.hedgerock.throwablehighlighter;

import com.intellij.ide.highlighter.JavaFileHighlighter;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.fileTypes.SyntaxHighlighter;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.openapi.options.colors.ColorDescriptor;
import com.intellij.openapi.options.colors.ColorSettingsPage;
import com.intellij.openapi.util.NlsContexts;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Stream;
import javax.swing.*;
import org.jetbrains.annotations.NonNls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class ThrowableColorSettingsPage implements ColorSettingsPage {

    private static final AttributesDescriptor[] DESCRIPTIONS = Stream.concat(
                    Arrays.stream(ThrowableHighlightingContext.values())
                            .map(context ->
                                    new AttributesDescriptor(context.getDisplayName(), context.getTextAttributesKey())),
                    Stream.of(ThrowableHighlightingContext.CLASS, ThrowableHighlightingContext.CATCH)
                            .flatMap(context -> Arrays.stream(ThrowableCategory.values())
                                    .map(category -> new AttributesDescriptor(
                                            category.getDisplayName(context), category.getTextAttributesKey(context)))))
            .toArray(AttributesDescriptor[]::new);

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
        return Map.of(
                "throwableChecked", ThrowableHighlighting.THROWABLE_CHECKED,
                "throwableRuntimeException", ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION,
                "throwableError", ThrowableHighlighting.THROWABLE_ERROR,
                "throwableImport", ThrowableHighlighting.THROWABLE_IMPORT,
                "throwableCatchChecked", ThrowableHighlighting.THROWABLE_CATCH_CHECKED,
                "throwableCatchRuntimeException", ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION,
                "throwableCatchError", ThrowableHighlighting.THROWABLE_CATCH_ERROR,
                "throwableThrows", ThrowableHighlighting.THROWABLE_THROWS,
                "throwableJavadoc", ThrowableHighlighting.THROWABLE_JAVADOC);
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
