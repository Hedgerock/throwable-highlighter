package io.github.hedgerock.throwablehighlighter;

import static org.junit.Assert.assertEquals;

import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import org.junit.Test;

public final class ThrowableHighlightingTest {

    @Test
    public void testCatchCategoryKeysShouldFallbackToThrowableCatch() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                ThrowableHighlighting.THROWABLE_CATCH_CHECKED.getFallbackAttributeKey());

        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION.getFallbackAttributeKey());

        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                ThrowableHighlighting.THROWABLE_CATCH_ERROR.getFallbackAttributeKey());
    }

    @Test
    public void testCategoryKeysShouldFallbackToThrowableClass() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_CHECKED.getFallbackAttributeKey());

        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION.getFallbackAttributeKey());

        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS, ThrowableHighlighting.THROWABLE_ERROR.getFallbackAttributeKey());
    }

    @Test
    public void testJavadocShouldFallbackToThrowableClassHighlighting() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_JAVADOC.getFallbackAttributeKey());
    }

    @Test
    public void testShouldFallbackToThrowableClassHighlighting() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_THROWS.getFallbackAttributeKey());
    }

    @Test
    public void testShouldUseInformationSeverityForJavadoc() {
        assertEquals(HighlightSeverity.INFORMATION, ThrowableHighlightingContext.JAVADOC.getSeverity());
    }

    @Test
    public void testCatchShouldFallbackToThrowableClassHighlighting() {
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS, ThrowableHighlighting.THROWABLE_CATCH.getFallbackAttributeKey());
    }

    @Test
    public void testShouldUseInformationSeverityForThrows() {
        assertEquals(HighlightSeverity.INFORMATION, ThrowableHighlightingContext.THROWS.getSeverity());
    }

    @Test
    public void testShouldUseInformationSeverityForCatch() {
        assertEquals(HighlightSeverity.INFORMATION, ThrowableHighlightingContext.CATCH.getSeverity());
    }

    @Test
    public void testShouldUseInformationSeverityForClass() {
        assertEquals(HighlightSeverity.INFORMATION, ThrowableHighlightingContext.CLASS.getSeverity());
    }

    @Test
    public void testShouldUseTextAttributesSeverityForImport() {
        assertEquals(HighlightSeverity.TEXT_ATTRIBUTES, ThrowableHighlightingContext.IMPORT.getSeverity());
    }

    @Test
    public void testShouldFallbackToClassHighlighting() {
        assertEquals(
                DefaultLanguageHighlighterColors.CLASS_NAME,
                ThrowableHighlighting.THROWABLE_CLASS.getFallbackAttributeKey());
    }
}
