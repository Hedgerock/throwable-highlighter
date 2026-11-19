package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;

enum ThrowableCategory {
    CHECKED("Throwable checked", ThrowableHighlighting.THROWABLE_CHECKED),
    RUNTIME_EXCEPTION("Throwable runtime exception", ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION),
    ERROR("Throwable error", ThrowableHighlighting.THROWABLE_ERROR);

    private final @Nls String displayName;
    private final TextAttributesKey textAttributesKey;

    ThrowableCategory(String displayName, TextAttributesKey textAttributesKey) {
        this.displayName = displayName;
        this.textAttributesKey = textAttributesKey;
    }

    @Nls
    @NotNull
    String getDisplayName() {
        return displayName;
    }

    @NotNull
    TextAttributesKey getTextAttributesKey() {
        return textAttributesKey;
    }
}
