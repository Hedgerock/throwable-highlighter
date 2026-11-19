package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import org.jetbrains.annotations.NotNull;

enum ThrowableCategory {
    CHECKED(ThrowableHighlighting.THROWABLE_CHECKED),
    RUNTIME_EXCEPTION(ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION),
    ERROR(ThrowableHighlighting.THROWABLE_ERROR);

    private final TextAttributesKey textAttributesKey;

    ThrowableCategory(TextAttributesKey textAttributesKey) {
        this.textAttributesKey = textAttributesKey;
    }

    @NotNull
    TextAttributesKey getTextAttributesKey() {
        return textAttributesKey;
    }
}
