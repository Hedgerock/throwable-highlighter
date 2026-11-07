package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;

enum ThrowableHighlightingContext {

    CLASS(
            "Throwable class",
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_CLASS
    ),
    IMPORT(
            "Throwable import",
            HighlightSeverity.TEXT_ATTRIBUTES,
            ThrowableHighlighting.THROWABLE_IMPORT
    ),
    CATCH(
            "Throwable catch",
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_CATCH
    ),
    THROWS(
            "Throwable throws",
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_THROWS
    ),
    JAVADOC(
            "Throwable Javadoc",
            HighlightSeverity.INFORMATION,
            ThrowableHighlighting.THROWABLE_JAVADOC
    );

    private final @Nls String displayName;
    private final HighlightSeverity severity;
    private final TextAttributesKey textAttributesKey;

    ThrowableHighlightingContext(
            @Nls String displayName,
            HighlightSeverity severity,
            TextAttributesKey textAttributesKey
    ) {
        this.displayName = displayName;
        this.severity = severity;
        this.textAttributesKey = textAttributesKey;
    }

    @Nls
    @NotNull
    String getDisplayName() {
        return displayName;
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
