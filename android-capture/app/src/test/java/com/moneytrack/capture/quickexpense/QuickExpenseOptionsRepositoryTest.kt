package com.moneytrack.capture.quickexpense

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseOptionsRepositoryTest {
    @Test
    fun `loads only valid accounts and expense categories in deterministic order`() {
        val reader = FakeCollectionReader(
            documentsByPath = mapOf(
                "users/$USER_ID/accounts" to listOf(
                    document("card", "name" to " Visa ", "type" to "credit", "isDefault" to false, "order" to 2L),
                    document("cash", "name" to "Efectivo", "type" to "cash", "isDefault" to true, "order" to 1L),
                    document("bad-type", "name" to "Préstamo", "type" to "loan", "isDefault" to false),
                    document("bad-default", "name" to "Banco", "type" to "savings", "isDefault" to "yes"),
                ),
                "users/$USER_ID/categories" to listOf(
                    document("transport", "name" to "Transporte", "type" to "expense", "order" to 2L),
                    document("food", "name" to "Comida", "type" to "expense", "order" to 1L),
                    document("income", "name" to "Salario", "type" to "income", "order" to 0L),
                    document("bad-name", "name" to "", "type" to "expense"),
                ),
            ),
        )
        var result: Result<QuickExpenseOptions>? = null

        QuickExpenseOptionsRepository(USER_ID, reader).load { result = it }

        assertEquals(
            listOf(
                QuickExpenseOption("cash", "Efectivo", isDefault = true),
                QuickExpenseOption("card", "Visa", isDefault = false),
            ),
            result?.getOrThrow()?.accounts,
        )
        assertEquals(
            listOf(
                QuickExpenseOption("food", "Comida"),
                QuickExpenseOption("transport", "Transporte"),
            ),
            result?.getOrThrow()?.categories,
        )
        assertEquals(
            listOf("users/$USER_ID/accounts", "users/$USER_ID/categories"),
            reader.paths,
        )
    }

    @Test
    fun `sorts equal orders by name then id`() {
        val reader = FakeCollectionReader(
            mapOf(
                "users/$USER_ID/accounts" to listOf(
                    document("z", "name" to "Billetera", "type" to "cash", "isDefault" to false),
                    document("b", "name" to "Ahorros", "type" to "savings", "isDefault" to false),
                    document("a", "name" to "ahorros", "type" to "savings", "isDefault" to false),
                ),
                "users/$USER_ID/categories" to emptyList(),
            ),
        )
        var options: QuickExpenseOptions? = null

        QuickExpenseOptionsRepository(USER_ID, reader).load { options = it.getOrThrow() }

        assertEquals(listOf("a", "b", "z"), options?.accounts?.map { it.id })
    }

    @Test
    fun `clears the default selection when more than one account claims it`() {
        val reader = FakeCollectionReader(
            mapOf(
                "users/$USER_ID/accounts" to listOf(
                    document("one", "name" to "Uno", "type" to "cash", "isDefault" to true),
                    document("two", "name" to "Dos", "type" to "savings", "isDefault" to true),
                ),
                "users/$USER_ID/categories" to emptyList(),
            ),
        )
        var options: QuickExpenseOptions? = null

        QuickExpenseOptionsRepository(USER_ID, reader).load { options = it.getOrThrow() }

        assertFalse(options!!.accounts.any { it.isDefault })
    }

    @Test
    fun `reports a collection failure without returning partial options`() {
        val reader = FakeCollectionReader(
            documentsByPath = mapOf("users/$USER_ID/accounts" to emptyList()),
            failurePath = "users/$USER_ID/categories",
        )
        var callbacks = 0
        var result: Result<QuickExpenseOptions>? = null

        QuickExpenseOptionsRepository(USER_ID, reader).load {
            callbacks += 1
            result = it
        }

        assertEquals(1, callbacks)
        assertTrue(result?.isFailure == true)
    }

    @Test
    fun `rejects an invalid uid before reading Firestore`() {
        val reader = FakeCollectionReader(emptyMap())

        val failure = runCatching { QuickExpenseOptionsRepository(" ", reader) }

        assertTrue(failure.isFailure)
        assertTrue(reader.paths.isEmpty())
    }

    private class FakeCollectionReader(
        private val documentsByPath: Map<String, List<QuickExpenseRawDocument>>,
        private val failurePath: String? = null,
    ) : QuickExpenseCollectionReader {
        val paths = mutableListOf<String>()

        override fun readCollection(
            collectionPath: String,
            onComplete: (Result<List<QuickExpenseRawDocument>>) -> Unit,
        ) {
            paths += collectionPath
            if (collectionPath == failurePath) {
                onComplete(Result.failure(IllegalStateException("offline")))
            } else {
                onComplete(Result.success(documentsByPath[collectionPath].orEmpty()))
            }
        }
    }

    private fun document(
        id: String,
        vararg fields: Pair<String, Any?>,
    ) = QuickExpenseRawDocument(id, mapOf(*fields))

    private companion object {
        const val USER_ID = "firebase-user"
    }
}
