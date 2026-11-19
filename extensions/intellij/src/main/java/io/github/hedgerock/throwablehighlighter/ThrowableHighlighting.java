package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import com.intellij.openapi.editor.colors.TextAttributesKey;

public final class ThrowableHighlighting {

    public static final TextAttributesKey THROWABLE_CLASS =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CLASS", DefaultLanguageHighlighterColors.CLASS_NAME);

    public static final TextAttributesKey THROWABLE_CHECKED =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CHECKED", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_RUNTIME_EXCEPTION =
            TextAttributesKey.createTextAttributesKey("THROWABLE_RUNTIME_EXCEPTION", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_ERROR =
            TextAttributesKey.createTextAttributesKey("THROWABLE_ERROR", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_IMPORT =
            TextAttributesKey.createTextAttributesKey("THROWABLE_IMPORT", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_CATCH =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CATCH", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_CATCH_CHECKED =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CATCH_CHECKED", THROWABLE_CATCH);

    public static final TextAttributesKey THROWABLE_CATCH_RUNTIME_EXCEPTION =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CATCH_RUNTIME_EXCEPTION", THROWABLE_CATCH);

    public static final TextAttributesKey THROWABLE_CATCH_ERROR =
            TextAttributesKey.createTextAttributesKey("THROWABLE_CATCH_ERROR", THROWABLE_CATCH);

    public static final TextAttributesKey THROWABLE_THROWS =
            TextAttributesKey.createTextAttributesKey("THROWABLE_THROWS", THROWABLE_CLASS);

    public static final TextAttributesKey THROWABLE_JAVADOC =
            TextAttributesKey.createTextAttributesKey("THROWABLE_JAVADOC", THROWABLE_CLASS);

    private ThrowableHighlighting() {}
}
