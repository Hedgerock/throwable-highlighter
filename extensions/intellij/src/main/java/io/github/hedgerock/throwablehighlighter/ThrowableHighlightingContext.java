package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.HighlightSeverity;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;

enum ThrowableHighlightingContext {
    CLASS("Throwable class", HighlightSeverity.INFORMATION),
    IMPORT("Throwable import", HighlightSeverity.TEXT_ATTRIBUTES),
    CATCH("Throwable catch", HighlightSeverity.INFORMATION),
    THROWS("Throwable throws", HighlightSeverity.INFORMATION),
    JAVADOC("Throwable Javadoc", HighlightSeverity.INFORMATION);

    private final @Nls String displayName;
    private final HighlightSeverity severity;

    ThrowableHighlightingContext(@Nls String displayName, HighlightSeverity severity) {
        this.displayName = displayName;
        this.severity = severity;
    }

    @Nls
    @NotNull
    public String getSourceDisplayName() {
        return displayName;
    }

    @NotNull
    public HighlightSeverity getSeverity() {
        return severity;
    }
}
