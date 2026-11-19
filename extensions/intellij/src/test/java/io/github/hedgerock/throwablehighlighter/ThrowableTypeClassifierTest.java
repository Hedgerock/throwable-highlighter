package io.github.hedgerock.throwablehighlighter;

import com.intellij.psi.PsiClass;
import com.intellij.testFramework.LightProjectDescriptor;
import com.intellij.testFramework.fixtures.LightJavaCodeInsightFixtureTestCase;
import org.jetbrains.annotations.NotNull;

public final class ThrowableTypeClassifierTest extends LightJavaCodeInsightFixtureTestCase {

    @Override
    protected @NotNull LightProjectDescriptor getProjectDescriptor() {
        return JAVA_21;
    }

    public void testShouldClassifyThrowableItselfAsChecked() {
        assertCategory("java.lang.Throwable", ThrowableCategory.CHECKED);
    }

    public void testShouldClassifyExceptionItselfAsChecked() {
        assertCategory("java.lang.Exception", ThrowableCategory.CHECKED);
    }

    public void testShouldClassifyRuntimeExceptionItself() {
        assertCategory("java.lang.RuntimeException", ThrowableCategory.RUNTIME_EXCEPTION);
    }

    public void testShouldClassifyErrorItself() {
        assertCategory("java.lang.Error", ThrowableCategory.ERROR);
    }

    public void testShouldClassifyTransitiveCheckedSubclass() {
        myFixture.addClass("""
                package example;

                public class BaseException extends Exception {
                }
                """);

        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class ApplicationException extends BaseException {
                }
                """);

        assertEquals(ThrowableCategory.CHECKED, ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldClassifyTransitiveRuntimeExceptionSubclass() {
        myFixture.addClass("""
                package example;

                public class BaseException extends RuntimeException {
                }
                """);

        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class ApplicationException extends BaseException {
                }
                """);

        assertEquals(ThrowableCategory.RUNTIME_EXCEPTION, ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldClassifyTransitiveErrorSubclass() {
        myFixture.addClass("""
                package example;

                public class BaseError extends Error {
                }
                """);

        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class ApplicationError extends BaseError {
                }
                """);

        assertEquals(ThrowableCategory.ERROR, ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldReturnNullForOrdinaryClass() {
        PsiClass psiClass = myFixture.findClass("java.lang.String");

        assertNull(ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldReturnNullForOrdinaryClassNamedThrowable() {
        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class Throwable {
                }
                """);

        assertNull(ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldReturnNullForOrdinaryClassNamedRuntimeException() {
        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class RuntimeException {
                }
                """);

        assertNull(ThrowableTypeClassifier.classify(psiClass));
    }

    public void testShouldReturnNullForOrdinaryClassNamedError() {
        PsiClass psiClass = myFixture.addClass("""
                package example;

                public class Error {
                }
                """);

        assertNull(ThrowableTypeClassifier.classify(psiClass));
    }

    private void assertCategory(String qualifiedName, ThrowableCategory expectedCategory) {
        PsiClass psiClass = myFixture.findClass(qualifiedName);

        assertEquals(expectedCategory, ThrowableTypeClassifier.classify(psiClass));
    }
}
