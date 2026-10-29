package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.psi.JavaTokenType;
import junit.framework.TestCase;

import java.util.Map;

public final class ThrowableColorSettingsPageTest extends TestCase {

    private final ThrowableColorSettingsPage page =
            new ThrowableColorSettingsPage();

    public void testShouldMapTagToThrowableJavadocHighlighting() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(
                ThrowableHighlighting.THROWABLE_JAVADOC,
                highlighting.get("throwableJavadoc")
        );
    }

    public void testShouldContainBothJavadocExceptionTagsInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(
                demoText.contains(
                        "@throws <throwableJavadoc>ApplicationException</throwableJavadoc>"
                )
        );

        assertTrue(
                demoText.contains(
                        "@exception java.lang.<throwableJavadoc>IllegalStateException</throwableJavadoc>"
                )
        );
    }

    public void testShouldUseJavaSyntaxHighlighting() {
        assertTrue(
                page.getHighlighter()
                        .getTokenHighlights(JavaTokenType.PUBLIC_KEYWORD)
                        .length > 0
        );

        assertTrue(
                page.getHighlighter()
                        .getTokenHighlights(JavaTokenType.END_OF_LINE_COMMENT)
                        .length > 0
        );
    }

    public void testShouldMapDemoTagToThrowableThrowsHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(
                ThrowableHighlighting.THROWABLE_THROWS,
                highlighting.get("throwableThrows")
        );
    }

    public void testShouldContainThrowableThrowsTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableThrows>"));
        assertTrue(demoText.contains("</throwableThrows>"));
    }

    public void testShouldContainThrowableImportTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableImport>"));
        assertTrue(demoText.contains("</throwableImport>"));
    }

    public void testShouldMapDemoTagToThrowableImportHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertNotNull(highlighting);
        assertEquals(
                ThrowableHighlighting.THROWABLE_IMPORT,
                highlighting.get("throwableImport")
        );
    }

    public void testShouldExposeThrowableHighlightingDescriptor() {
        AttributesDescriptor[] descriptors =
                page.getAttributeDescriptors();

        assertEquals(5, descriptors.length);
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                descriptors[0].getKey()
        );
        assertEquals(
                ThrowableHighlighting.THROWABLE_IMPORT,
                descriptors[1].getKey()
        );
        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                descriptors[2].getKey()
        );
        assertEquals(
                ThrowableHighlighting.THROWABLE_THROWS,
                descriptors[3].getKey()
        );
        assertEquals(
                ThrowableHighlighting.THROWABLE_JAVADOC,
                descriptors[4].getKey()
        );
    }

    public void testShouldContainThrowableCatchTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableCatch>"));
        assertTrue(demoText.contains("</throwableCatch>"));
    }

    public void testShouldMapDemoTagToThrowableCatchHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH,
                highlighting.get("throwableCatch")
        );
    }

    public void testShouldMapDemoTagToThrowableHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertNotNull(highlighting);
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                highlighting.get("throwable")
        );
    }

    public void testShouldContainThrowableTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwable>"));
        assertTrue(demoText.contains("</throwable>"));
    }
}
