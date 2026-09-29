package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.AnnotationHolder;
import com.intellij.lang.annotation.Annotator;
import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.psi.PsiClass;
import com.intellij.psi.PsiElement;
import com.intellij.psi.PsiIdentifier;
import com.intellij.psi.PsiJavaCodeReferenceElement;
import com.intellij.psi.util.InheritanceUtil;
import org.jetbrains.annotations.NotNull;

public final class ThrowableAnnotator implements Annotator {

    @Override
    public void annotate(
            @NotNull PsiElement psiElement,
            @NotNull AnnotationHolder annotationHolder
    ) {
        if (psiElement instanceof PsiJavaCodeReferenceElement referenceElement) {
            annotateReference(referenceElement, annotationHolder);
            return;
        }

        if (psiElement instanceof  PsiClass psiClass) {
            annotateDeclaration(psiClass, annotationHolder);
        }
    }

    private void annotateDeclaration(
            PsiClass psiClass,
            AnnotationHolder annotationHolder
    ) {
        if (!isThrowable(psiClass)) {
            return;
        }

        PsiIdentifier identifier = psiClass.getNameIdentifier();

        if (identifier == null) {
            return;
        }

        annotationHolder.newSilentAnnotation(HighlightSeverity.INFORMATION)
                .range(identifier)
                .textAttributes(ThrowableHighlighting.THROWABLE_CLASS)
                .create();
    }

    private void annotateReference(
            PsiJavaCodeReferenceElement referenceElement,
            AnnotationHolder annotationHolder
    ) {
        PsiElement resolved = referenceElement.resolve();

        if (!(resolved instanceof PsiClass psiClass)) {
            return;
        }

        if (!isThrowable(psiClass)) {
            return;
        }

        annotationHolder.newSilentAnnotation(HighlightSeverity.INFORMATION)
                .range(referenceElement)
                .textAttributes(ThrowableHighlighting.THROWABLE_CLASS)
                .create();
    }

    private boolean isThrowable(PsiClass psiClass) {
        return InheritanceUtil.isInheritor(psiClass, Throwable.class.getName());
    }
}
