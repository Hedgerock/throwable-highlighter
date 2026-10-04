plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "io.github.hedgerock"
version = "1.1.0"

repositories {
    mavenCentral()

    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {

    intellijPlatform {
        intellijIdea("2026.2")
        bundledPlugin("com.intellij.java")

        testFrameworks(
            org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform,
            org.jetbrains.intellij.platform.gradle.TestFrameworkType.Plugin.Java
        )
    }

    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    signing {
        certificateChain =
            providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey =
            providers.environmentVariable("PRIVATE_KEY")
        password =
            providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = providers.environmentVariable("PUBLISH_TOKEN")
    }
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}