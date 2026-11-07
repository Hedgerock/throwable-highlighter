package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.util.Disposer;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import com.intellij.util.ui.UIUtil;

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
        ThrowableHighlightingSettings.SettingsState originalState = settings.getState();

        Disposer.register(
                getTestRootDisposable(),
                () -> {
                    try {
                        configurable.disposeUIResources();
                    } finally {
                        settings.loadState(originalState);
                    }
                }
        );

        settings.loadState(new ThrowableHighlightingSettings.SettingsState());
    }

    public void testShouldKeepSettingsUnchangedWithoutCreatingUi() {
        configurable.apply();
        configurable.reset();
        configurable.cancel();
        configurable.disposeUIResources();

        assertFalse(configurable.isModified());
        assertNull(configurable.getPreferredFocusedComponent());

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                getSavedSource()
        );
    }

    public void testShouldOfferBothCatchSources() {
        configurable.createComponent();

        ComboBox<?> comboBox = getSourceComboBox();

        assertEquals(2, comboBox.getItemCount());

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                comboBox.getItemAt(0)
        );

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                comboBox.getItemAt(1)
        );
    }

    public void testShouldLoadSavedSourceWhenCreatingUi() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configurable.createComponent();

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldKeepSourceChangesInDraftUntilApply() {
        configurable.createComponent();

        getSourceComboBox().setSelectedItem(ThrowableHighlightingSource.JAVA);

        assertTrue(configurable.isModified());

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                getSavedSource()
        );
    }

    public void testShouldApplySelectedSource() {
        configurable.createComponent();

        getSourceComboBox().setSelectedItem(ThrowableHighlightingSource.JAVA);

        configurable.apply();

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldResetDraftToSavedSource() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configurable.createComponent();

        getSourceComboBox().setSelectedItem(
                ThrowableHighlightingSource.PLUGIN
        );

        configurable.reset();

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldDiscardUnappliedChangesAfterCancelAndRecreation() {
        JComponent originalPanel = configurable.createComponent();

        getSourceComboBox().setSelectedItem(ThrowableHighlightingSource.JAVA);
        assertTrue(configurable.isModified());

        configurable.cancel();
        configurable.disposeUIResources();

        assertNull(configurable.getPreferredFocusedComponent());

        JComponent recreatedPanel = configurable.createComponent();

        assertNotSame(originalPanel, recreatedPanel);

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                getSavedSource()
        );

        assertFalse(configurable.isModified());
    }

    public void testShouldKeepDraftWhenComponentIsRequestedAgain() {
        JComponent originalPanel = configurable.createComponent();

        getSourceComboBox().setSelectedItem(ThrowableHighlightingSource.JAVA);

        JComponent requestedPanel = configurable.createComponent();

        assertSame(originalPanel, requestedPanel);

        assertEquals(
                ThrowableHighlightingSource.JAVA,
                getSourceComboBox().getSelectedItem()
        );

        assertEquals(
                ThrowableHighlightingSource.PLUGIN,
                getSavedSource()
        );

        assertTrue(configurable.isModified());
    }



    public void testShouldOfferBothSourcesForEveryContext() {
        JComponent panel = configurable.createComponent();

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            ComboBox<?> comboBox = findSourceComboBox(panel, context);

            assertEquals(2, comboBox.getItemCount());
            assertEquals(ThrowableHighlightingSource.PLUGIN, comboBox.getItemAt(0));
            assertEquals(ThrowableHighlightingSource.JAVA, comboBox.getItemAt(1));
        }
    }

    public void testShouldApplySourcesForMultipleContexts() {
        JComponent panel = configurable.createComponent();
        findSourceComboBox(panel, ThrowableHighlightingContext.CLASS)
                .setSelectedItem(ThrowableHighlightingSource.JAVA);
        findSourceComboBox(panel, ThrowableHighlightingContext.THROWS)
                .setSelectedItem(ThrowableHighlightingSource.JAVA);

        assertTrue(configurable.isModified());

        configurable.apply();

        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();
        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            boolean useJava = context == ThrowableHighlightingContext.CLASS
                    || context == ThrowableHighlightingContext.THROWS;
            assertEquals(
                    context.name(),
                    useJava ? ThrowableHighlightingSource.JAVA : ThrowableHighlightingSource.PLUGIN,
                    settings.getHighlightingSource(context)
            );
        }

        assertFalse(configurable.isModified());
    }

    private ComboBox<?> getSourceComboBox() {
        return findSourceComboBox(configurable.createComponent(), ThrowableHighlightingContext.CATCH);
    }

    private ComboBox<?> findSourceComboBox(
            JComponent panel,
            ThrowableHighlightingContext context
    ) {
        ComboBox<?> comboBox = UIUtil.uiTraverser(panel)
                .filter(ComboBox.class)
                .find(candidate -> context.name().equals(candidate.getName()));
        assertNotNull(context.name(), comboBox);
        return comboBox;
    }

    private ThrowableHighlightingSource getSavedSource() {
        return ThrowableHighlightingSettings.getInstance()
                .getHighlightingSource(ThrowableHighlightingContext.CATCH);
    }
}
