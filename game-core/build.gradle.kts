import org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsEnvSpec

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

kotlin {
    jvmToolchain(21)
    jvm()
    js(IR) {
        nodejs {
            // Full multi-deal simulations share CI CPUs with compilation; keep assertions,
            // but allow more than Mocha's default two seconds per scenario.
            testTask { useMocha { timeout = "10s" } }
        }
        binaries.library()
        generateTypeScriptDefinitions()
        useEsModules()
    }
    sourceSets {
        commonMain.dependencies { implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0") }
        commonTest.dependencies { implementation(kotlin("test")) }
    }
}
// Use a preinstalled Node when requested; normal builds download the pinned Node runtime.
rootProject.plugins.withType<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsPlugin> {
    rootProject.extensions.configure<NodeJsEnvSpec> {
        if (providers.gradleProperty("useSystemNode").orNull == "true") download.set(false)
    }
}
