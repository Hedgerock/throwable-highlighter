package io.github.hedgerock.throwablehighlighter;

import com.intellij.psi.PsiClass;
import com.intellij.psi.util.InheritanceUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

final class ThrowableTypeClassifier {

    private ThrowableTypeClassifier() {}

    static @Nullable ThrowableCategory classify(@NotNull PsiClass psiClass) {
        if (!InheritanceUtil.isInheritor(psiClass, Throwable.class.getName())) {
            return null;
        }

        if (InheritanceUtil.isInheritor(psiClass, RuntimeException.class.getName())) {
            return ThrowableCategory.RUNTIME_EXCEPTION;
        }

        if (InheritanceUtil.isInheritor(psiClass, Error.class.getName())) {
            return ThrowableCategory.ERROR;
        }

        return ThrowableCategory.CHECKED;
    }
}
