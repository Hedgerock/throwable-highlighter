package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.EditorColorsScheme;
import com.intellij.openapi.editor.colors.impl.EditorColorsSchemeImpl;
import com.intellij.openapi.editor.colors.impl.EmptyColorScheme;
import com.intellij.openapi.editor.markup.TextAttributes;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import java.awt.Color;
import java.awt.Font;
import org.jdom.Element;

public final class ThrowableColorSchemeTest extends BasePlatformTestCase {

    public void testShouldApplySavedCatchAttributesToEveryCategory() {
        EditorColorsSchemeImpl original = createScheme();
        TextAttributes expected = createAttributes(0x123456, Font.BOLD);

        original.setAttributes(ThrowableHighlighting.THROWABLE_CATCH, expected);

        Element savedScheme = new Element("scheme");
        original.writeExternal(savedScheme);

        Element savedAttributes = savedScheme.getChild("attributes");
        assertNotNull(savedAttributes);
        assertEquals(1, savedAttributes.getChildren("option").size());
        assertEquals("THROWABLE_CATCH", savedAttributes.getChild("option").getAttributeValue("name"));

        EditorColorsSchemeImpl restored = createScheme();
        restored.readExternal(savedScheme);

        assertEquals(expected, restored.getAttributes(ThrowableHighlighting.THROWABLE_CATCH));
        assertCatchAttributes(restored, expected);
    }

    public void testShouldKeepClassAndCatchCategoryAttributesIndependent() {
        EditorColorsSchemeImpl scheme = createScheme();
        TextAttributes classAttributes = createAttributes(0x123456, Font.PLAIN);
        TextAttributes catchAttributes = createAttributes(0x654321, Font.BOLD);

        scheme.setAttributes(ThrowableHighlighting.THROWABLE_CHECKED, classAttributes);
        scheme.setAttributes(ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION, classAttributes);
        scheme.setAttributes(ThrowableHighlighting.THROWABLE_ERROR, classAttributes);
        scheme.setAttributes(ThrowableHighlighting.THROWABLE_CATCH, catchAttributes);

        assertEquals(classAttributes, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CHECKED));
        assertEquals(classAttributes, scheme.getAttributes(ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION));
        assertEquals(classAttributes, scheme.getAttributes(ThrowableHighlighting.THROWABLE_ERROR));

        assertCatchAttributes(scheme, catchAttributes);
    }

    public void testShouldKeepOwnCatchCategoryAttributesWhenParentChanges() {
        EditorColorsSchemeImpl scheme = createScheme();
        TextAttributes originalParent = createAttributes(0x123456, Font.PLAIN);
        TextAttributes customCategory = createAttributes(0x654321, Font.ITALIC);
        TextAttributes updatedParent = createAttributes(0xABCDEF, Font.BOLD);

        scheme.setAttributes(ThrowableHighlighting.THROWABLE_CATCH, originalParent);
        scheme.setAttributes(ThrowableHighlighting.THROWABLE_CATCH_CHECKED, customCategory);

        scheme.setAttributes(ThrowableHighlighting.THROWABLE_CATCH, updatedParent);

        assertEquals(customCategory, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_CHECKED));
        assertEquals(updatedParent, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION));
        assertEquals(updatedParent, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_ERROR));
    }

    private EditorColorsSchemeImpl createScheme() {
        EditorColorsSchemeImpl scheme = new EditorColorsSchemeImpl(EmptyColorScheme.getEmptyScheme());
        scheme.setName("Throwable Highlighter test");
        return scheme;
    }

    private TextAttributes createAttributes(int foreground, int fontType) {
        TextAttributes attributes = new TextAttributes();
        attributes.setForegroundColor(new Color(foreground));
        attributes.setFontType(fontType);
        return attributes;
    }

    private void assertCatchAttributes(EditorColorsScheme scheme, TextAttributes expected) {
        assertEquals(expected, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_CHECKED));
        assertEquals(expected, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION));
        assertEquals(expected, scheme.getAttributes(ThrowableHighlighting.THROWABLE_CATCH_ERROR));
    }
}
