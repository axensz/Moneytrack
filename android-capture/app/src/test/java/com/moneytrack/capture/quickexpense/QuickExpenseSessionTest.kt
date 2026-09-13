package com.moneytrack.capture.quickexpense

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseSessionTest {
    @Test
    fun `restores private state only for the same user and installation`() {
        val binding = quickExpenseOwnerBinding("user-1", "install-1")

        assertTrue(canRestoreQuickExpenseState(binding, "user-1", "install-1"))
        assertFalse(canRestoreQuickExpenseState(binding, "user-2", "install-1"))
        assertFalse(canRestoreQuickExpenseState(binding, "user-1", "install-2"))
        assertFalse(canRestoreQuickExpenseState(binding, null, "install-1"))
        assertFalse(canRestoreQuickExpenseState(null, "user-1", "install-1"))
    }

    @Test
    fun `owner binding is opaque and scoped`() {
        val first = quickExpenseOwnerBinding("user-1", "install-1")
        val second = quickExpenseOwnerBinding("user-2", "install-1")

        assertTrue(Regex("[a-f0-9]{64}").matches(first))
        assertFalse(first.contains("user-1"))
        assertNotEquals(first, second)
    }
}
