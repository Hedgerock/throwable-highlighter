package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class ThrowableHighlightingTest {

    @Test
    public void testShouldFallbackToClassHighlighting() {
        assertEquals(
                DefaultLanguageHighlighterColors.CLASS_NAME,
                ThrowableHighlighting.THROWABLE_CLASS.getFallbackAttributeKey()
        );
    }
}
