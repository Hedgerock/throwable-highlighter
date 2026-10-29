package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.util.Disposer;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;

import javax.swing.JComponent;

public final class ThrowableHighlightingSettingsConfigurableTest
        extends BasePlatformTestCase {

    private final ThrowableHighlightingSettingsConfigurable configurable =
            new ThrowableHighlightingSettingsConfigurable();

    @Override
    protected boolean runInDispatchThread() {
        return true;
    }

    @Override
    protected void setUp() throws Exception {
        super.setUp();

        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();

        CatchHighlightingSource originalSource =
                settings.getCatchHighlightingSource();

        Disposer.register(
                getTestRootDisposable(),
                () -> {
                    try {
                        configurable.disposeUIResources();
                    } finally {
                        ThrowableHighlightingSettings.getInstance()
                                .setCatchSource(originalSource);
                    }
                }
        );

        settings.setCatchSource(CatchHighlightingSource.THROWABLE_CATCH);
    }

    public void testShouldKeepSettingsUnchangedWithoutCreatingUi() {
        configurable.apply();
        configurable.reset();
        configurable.cancel();
        configurable.disposeUIResources();

        assertFalse(configurable.isModified());
        assertNull(configurable.getPreferredFocusedComponent());

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                getSavedSource()
        );
    }

    public void testShouldOfferBothCatchSources() {
        configurable.createComponent();

        ComboBox<?> comboBox = getSourceComboBox();

        assertEquals(2, comboBox.getItemCount());

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                comboBox.getItemAt(0)
        );

        assertEquals(
                CatchHighlightingSource.JAVA,
                comboBox.getItemAt(1)
        );
    }

    public void testShouldLoadSavedSourceWhenCreatingUi() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configurable.createComponent();

        assertEquals(
                CatchHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldKeepSourceChangesInDraftUntilApply() {
        configurable.createComponent();

        getSourceComboBox().setSelectedItem(CatchHighlightingSource.JAVA);

        assertTrue(configurable.isModified());

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                getSavedSource()
        );
    }

    public void testShouldApplySelectedSource() {
        configurable.createComponent();

        getSourceComboBox().setSelectedItem(CatchHighlightingSource.JAVA);

        configurable.apply();

        assertEquals(
                CatchHighlightingSource.JAVA,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldResetDraftToSavedSource() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configurable.createComponent();

        getSourceComboBox().setSelectedItem(
                CatchHighlightingSource.THROWABLE_CATCH
        );

        configurable.reset();

        assertEquals(
                CatchHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                CatchHighlightingSource.JAVA,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldDiscardUnappliedChangesAfterCancelAndRecreation() {
        JComponent originalPanel = configurable.createComponent();

        getSourceComboBox().setSelectedItem(CatchHighlightingSource.JAVA);

        configurable.cancel();
        configurable.disposeUIResources();

        assertNull(configurable.getPreferredFocusedComponent());

        JComponent recreatedPanel = configurable.createComponent();

        assertNotSame(originalPanel, recreatedPanel);

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldKeepDraftWhenComponentIsRequestedAgain() {
        JComponent originalPanel = configurable.createComponent();

        getSourceComboBox().setSelectedItem(CatchHighlightingSource.JAVA);

        JComponent requestedPanel = configurable.createComponent();

        assertSame(originalPanel, requestedPanel);

        assertEquals(
                CatchHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                CatchHighlightingSource.THROWABLE_CATCH,
                getSavedSource()
        );

        assertTrue(configurable.isModified());
    }

    private ComboBox<?> getSourceComboBox() {
        JComponent component = configurable.getPreferredFocusedComponent();

        assertTrue(component instanceof ComboBox<?>);

        return (ComboBox<?>) component;
    }

    private CatchHighlightingSource getSavedSource() {
        return ThrowableHighlightingSettings.getInstance()
                .getCatchHighlightingSource();
    }
}
