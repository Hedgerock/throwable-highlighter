package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class ThrowableHighlightingTest {

    @Test
    public void testShouldUseCatchStyleForCatchContext() {
        assertEquals(
                HighlightSeverity.INFORMATION,
                ThrowableHighlightingContext.CATCH.getSeverity()
        );

        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                ThrowableHighlightingContext.CATCH.getTextAttributesKey()
        );
    }

    @Test
    public void testCatchShouldFallbackToThrowableClassHighlighting() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_CATCH.getFallbackAttributeKey()
        );
    }

    @Test
    public void testShouldUseClassStyleForClassContext() {
        assertEquals(
                HighlightSeverity.INFORMATION,
                ThrowableHighlightingContext.CLASS.getSeverity()
        );

        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlightingContext.CLASS.getTextAttributesKey()
        );
    }

    @Test
    public void testShouldUseImportStyleForImportContext() {
        assertEquals(
                HighlightSeverity.TEXT_ATTRIBUTES,
                ThrowableHighlightingContext.IMPORT.getSeverity()
        );

        assertEquals(
                ThrowableHighlighting.THROWABLE_IMPORT,
                ThrowableHighlightingContext.IMPORT.getTextAttributesKey()
        );
    }

    @Test
    public void testShouldFallbackToClassHighlighting() {
        assertEquals(
                DefaultLanguageHighlighterColors.CLASS_NAME,
                ThrowableHighlighting.THROWABLE_CLASS.getFallbackAttributeKey()
        );
    }
}
