package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;

enum ThrowableCategory {
    CHECKED(
            "Throwable checked",
            "Throwable catch checked",
            ThrowableHighlighting.THROWABLE_CHECKED,
            ThrowableHighlighting.THROWABLE_CATCH_CHECKED),
    RUNTIME_EXCEPTION(
            "Throwable runtime exception",
            "Throwable catch runtime exception",
            ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION,
            ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION),
    ERROR(
            "Throwable error",
            "Throwable catch error",
            ThrowableHighlighting.THROWABLE_ERROR,
            ThrowableHighlighting.THROWABLE_CATCH_ERROR);

    private final @Nls String classDisplayName;
    private final @Nls String catchDisplayName;
    private final TextAttributesKey classTextAttributesKey;
    private final TextAttributesKey catchTextAttributesKey;

    ThrowableCategory(
            @Nls String classDisplayName,
            @Nls String catchDisplayName,
            TextAttributesKey classTextAttributesKey,
            TextAttributesKey catchTextAttributesKey) {
        this.classDisplayName = classDisplayName;
        this.catchDisplayName = catchDisplayName;
        this.classTextAttributesKey = classTextAttributesKey;
        this.catchTextAttributesKey = catchTextAttributesKey;
    }

    @Nls
    @NotNull
    String getDisplayName(@NotNull ThrowableHighlightingContext context) {
        return switch (context) {
            case CLASS -> classDisplayName;
            case CATCH -> catchDisplayName;
            default -> context.getDisplayName();
        };
    }

    @NotNull
    TextAttributesKey getTextAttributesKey(@NotNull ThrowableHighlightingContext context) {
        return switch (context) {
            case CLASS -> classTextAttributesKey;
            case CATCH -> catchTextAttributesKey;
            default -> context.getTextAttributesKey();
        };
    }
}
