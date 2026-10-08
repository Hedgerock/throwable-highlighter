package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import org.jetbrains.annotations.NotNull;

enum ThrowableHighlightingContext {

    CLASS(
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_CLASS
    ),
    IMPORT(
            HighlightSeverity.TEXT_ATTRIBUTES,
            ThrowableHighlighting.THROWABLE_IMPORT
    ),
    CATCH(
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_CATCH
    );

    private final HighlightSeverity severity;
    private final TextAttributesKey textAttributesKey;

    ThrowableHighlightingContext(
            HighlightSeverity severity,
            TextAttributesKey textAttributesKey
    ) {
        this.severity = severity;
        this.textAttributesKey = textAttributesKey;
    }

    @NotNull
    HighlightSeverity getSeverity() {
        return severity;
    }

    @NotNull
    TextAttributesKey getTextAttributesKey() {
        return textAttributesKey;
    }
}
