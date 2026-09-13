package com.moneytrack.capture.quickexpense

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import java.util.Locale

data class QuickExpenseOption(
    val id: String,
    val name: String,
    val isDefault: Boolean = false,
)

data class QuickExpenseOptions(
    val accounts: List<QuickExpenseOption>,
    val categories: List<QuickExpenseOption>,
)

data class QuickExpenseRawDocument(
    val id: String,
    val fields: Map<String, Any?>,
)

fun interface QuickExpenseCollectionReader {
    fun readCollection(
        collectionPath: String,
        onComplete: (Result<List<QuickExpenseRawDocument>>) -> Unit,
    )
}

class FirebaseQuickExpenseCollectionReader(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : QuickExpenseCollectionReader {
    override fun readCollection(
        collectionPath: String,
        onComplete: (Result<List<QuickExpenseRawDocument>>) -> Unit,
    ) {
        firestore.collection(collectionPath)
            .get(Source.DEFAULT)
            .addOnSuccessListener { snapshot ->
                onComplete(
                    Result.success(
                        snapshot.documents.map { document ->
                            QuickExpenseRawDocument(document.id, document.data.orEmpty())
                        },
                    ),
                )
            }
            .addOnFailureListener { error -> onComplete(Result.failure(error)) }
    }
}

class QuickExpenseOptionsRepository(
    uid: String,
    private val reader: QuickExpenseCollectionReader = FirebaseQuickExpenseCollectionReader(),
) {
    private val accountsPath: String
    private val categoriesPath: String

    init {
        requireValidQuickExpenseUid(uid)
        accountsPath = "users/$uid/accounts"
        categoriesPath = "users/$uid/categories"
    }

    fun load(onResult: (Result<QuickExpenseOptions>) -> Unit) {
        try {
            reader.readCollection(accountsPath) { accountsResult ->
                val accountDocuments = accountsResult.getOrElse { error ->
                    onResult(Result.failure(error))
                    return@readCollection
                }
                loadCategories(accountDocuments, onResult)
            }
        } catch (error: RuntimeException) {
            onResult(Result.failure(error))
        }
    }

    private fun loadCategories(
        accountDocuments: List<QuickExpenseRawDocument>,
        onResult: (Result<QuickExpenseOptions>) -> Unit,
    ) {
        try {
            reader.readCollection(categoriesPath) { categoriesResult ->
                val categoryDocuments = categoriesResult.getOrElse { error ->
                    onResult(Result.failure(error))
                    return@readCollection
                }
                onResult(
                    Result.success(
                        QuickExpenseOptions(
                            accounts = decodeAccounts(accountDocuments),
                            categories = decodeCategories(categoryDocuments),
                        ),
                    ),
                )
            }
        } catch (error: RuntimeException) {
            onResult(Result.failure(error))
        }
    }
}

private data class RankedQuickExpenseOption(
    val option: QuickExpenseOption,
    val order: Long,
)

private fun decodeAccounts(
    documents: List<QuickExpenseRawDocument>,
): List<QuickExpenseOption> {
    val decoded = documents.mapNotNull { document ->
        val name = (document.fields["name"] as? String)?.trim()
        val type = document.fields["type"] as? String
        val isDefault = document.fields["isDefault"] as? Boolean
        if (
            !validOptionId(document.id) ||
            name.isNullOrEmpty() ||
            type !in ACCOUNT_TYPES ||
            isDefault == null
        ) {
            return@mapNotNull null
        }
        RankedQuickExpenseOption(
            option = QuickExpenseOption(document.id, name, isDefault),
            order = decodeOrder(document.fields["order"]),
        )
    }
    val singleDefaultId = decoded.filter { it.option.isDefault }.singleOrNull()?.option?.id
    return decoded.sortedWith(RANKED_OPTION_COMPARATOR)
        .map { ranked ->
            ranked.option.copy(isDefault = ranked.option.id == singleDefaultId)
        }
}

private fun decodeCategories(
    documents: List<QuickExpenseRawDocument>,
): List<QuickExpenseOption> = documents.mapNotNull { document ->
    val name = (document.fields["name"] as? String)?.trim()
    if (
        !validOptionId(document.id) ||
        document.fields["type"] != "expense" ||
        name.isNullOrEmpty() ||
        name.length > 100
    ) {
        return@mapNotNull null
    }
    RankedQuickExpenseOption(
        option = QuickExpenseOption(document.id, name),
        order = decodeOrder(document.fields["order"]),
    )
}.sortedWith(RANKED_OPTION_COMPARATOR)
    .map(RankedQuickExpenseOption::option)

private val RANKED_OPTION_COMPARATOR = compareBy<RankedQuickExpenseOption>(
    { it.order },
    { it.option.name.lowercase(Locale.ROOT) },
    { it.option.id },
)

private fun validOptionId(id: String): Boolean =
    id.isNotBlank() && id.length <= 1_500 && '/' !in id

private fun decodeOrder(value: Any?): Long {
    val number = value as? Number ?: return Long.MAX_VALUE
    val asDouble = number.toDouble()
    if (!asDouble.isFinite() || asDouble % 1.0 != 0.0) return Long.MAX_VALUE
    return number.toLong()
}

private val ACCOUNT_TYPES = setOf("savings", "credit", "cash")

internal fun requireValidQuickExpenseUid(uid: String) {
    require(uid.isNotBlank() && uid.length <= 128 && '/' !in uid) {
        "Invalid authenticated user"
    }
}
