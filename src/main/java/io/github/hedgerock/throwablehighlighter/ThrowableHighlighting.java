package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import com.intellij.openapi.editor.colors.TextAttributesKey;

public final class ThrowableHighlighting {

    public static final TextAttributesKey THROWABLE_CLASS =
            TextAttributesKey.createTextAttributesKey(
                    "THROWABLE_CLASS",
                    DefaultLanguageHighlighterColors.CLASS_NAME
            );

    private ThrowableHighlighting() {

    }
}
