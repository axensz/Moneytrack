package com.moneytrack.capture.auth

import android.os.CancellationSignal
import androidx.activity.ComponentActivity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.moneytrack.capture.R
import java.util.concurrent.Executor

enum class AuthenticationResult {
    SIGNED_IN,
    SIGNED_OUT,
    CONFIGURATION_MISSING,
    FAILED,
}

class GoogleSignInController(
    private val activity: ComponentActivity,
    private val credentialManager: CredentialManager = CredentialManager.create(activity),
) {
    private val mainExecutor = Executor { command -> activity.runOnUiThread(command) }

    fun signIn(onResult: (AuthenticationResult) -> Unit) {
        val auth = firebaseAuthOrNull()
        val webClientId = generatedWebClientId()
        if (auth == null || webClientId == null) {
            onResult(AuthenticationResult.CONFIGURATION_MISSING)
            return
        }

        val request = try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setServerClientId(webClientId)
                .setFilterByAuthorizedAccounts(false)
                .build()
            GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
        } catch (_: RuntimeException) {
            onResult(AuthenticationResult.FAILED)
            return
        }

        credentialManager.getCredentialAsync(
            activity,
            request,
            CancellationSignal(),
            mainExecutor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    authenticateCredential(auth, result, onResult)
                }

                override fun onError(e: GetCredentialException) {
                    when (e) {
                        is NoCredentialException -> onResult(AuthenticationResult.FAILED)
                        else -> onResult(AuthenticationResult.FAILED)
                    }
                }
            },
        )
    }

    fun signOut(onResult: (AuthenticationResult) -> Unit) {
        firebaseAuthOrNull()?.signOut()
        credentialManager.clearCredentialStateAsync(
            ClearCredentialStateRequest(),
            CancellationSignal(),
            mainExecutor,
            object : CredentialManagerCallback<Void?, ClearCredentialException> {
                override fun onResult(result: Void?) {
                    onResult(AuthenticationResult.SIGNED_OUT)
                }

                override fun onError(e: ClearCredentialException) {
                    onResult(AuthenticationResult.FAILED)
                }
            },
        )
    }

    private fun authenticateCredential(
        auth: FirebaseAuth,
        response: GetCredentialResponse,
        onResult: (AuthenticationResult) -> Unit,
    ) {
        val credential = response.credential
        if (
            credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            onResult(AuthenticationResult.FAILED)
            return
        }

        val googleCredential = try {
            GoogleIdTokenCredential.createFrom(credential.data)
        } catch (_: RuntimeException) {
            onResult(AuthenticationResult.FAILED)
            return
        }
        val firebaseCredential = GoogleAuthProvider.getCredential(googleCredential.idToken, null)
        auth.signInWithCredential(firebaseCredential)
            .addOnCompleteListener(activity) { task ->
                onResult(
                    if (task.isSuccessful && auth.currentUser != null) {
                        AuthenticationResult.SIGNED_IN
                    } else {
                        AuthenticationResult.FAILED
                    },
                )
            }
    }

    private fun firebaseAuthOrNull(): FirebaseAuth? =
        if (FirebaseApp.getApps(activity).isEmpty()) null else FirebaseAuth.getInstance()

    private fun generatedWebClientId(): String? {
        return activity.getString(R.string.default_web_client_id)
            .trim()
            .takeIf(String::isNotEmpty)
    }
}
