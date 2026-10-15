plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
    application
}
kotlin { jvmToolchain(21) }
application { mainClass.set("am.blot.server.MainKt") }
val ktorVersion = "3.3.0"
dependencies {
    implementation(project(":game-core"))
    implementation("io.ktor:ktor-client-cio:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("io.ktor:ktor-server-cors:$ktorVersion")
    implementation("org.slf4j:slf4j-simple:2.0.17")
    testImplementation(kotlin("test"))
    testImplementation("io.ktor:ktor-client-mock:$ktorVersion")
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
    testImplementation("io.ktor:ktor-client-websockets:$ktorVersion")
    testImplementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}

tasks.processResources {
    from(rootProject.file("docs")) {
        include("trainer-system-prompt.txt", "trainer-model.schema.json", "rules/profile-v1.md", "rules/profile-v2.md", "rules/trainer-profile-v1.txt", "rules/trainer-profile-v2.txt")
        into("trainer")
    }
    doLast {
        listOf("trainer-system-prompt.txt", "trainer-model.schema.json", "rules/profile-v1.md", "rules/profile-v2.md", "rules/trainer-profile-v1.txt", "rules/trainer-profile-v2.txt").forEach {
            check(destinationDir.resolve("trainer/$it").isFile) { "Missing trainer resource: $it" }
        }
    }
}
