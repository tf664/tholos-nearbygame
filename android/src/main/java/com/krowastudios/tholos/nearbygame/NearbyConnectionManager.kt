package com.krowastudios.tholos.nearbygame

import android.content.Context
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks

class NearbyConnectionManager(
    context: Context,
    private val listener: Listener,
) {
    private val client = Nearby.getConnectionsClient(context)
    private val strategy = Strategy.P2P_CLUSTER

    fun startAdvertising(serviceId: String, displayName: String): Task<Void> {
        val options = AdvertisingOptions.Builder()
            .setStrategy(strategy)
            .build()

        return client.startAdvertising(
            displayName,
            serviceId,
            connectionLifecycleCallback,
            options,
        )
    }

    fun stopAdvertising(): Task<Void> {
        client.stopAdvertising()
        return Tasks.forResult(null)
    }

    fun startDiscovery(serviceId: String): Task<Void> {
        val options = DiscoveryOptions.Builder()
            .setStrategy(strategy)
            .build()

        return client.startDiscovery(
            serviceId,
            endpointDiscoveryCallback,
            options,
        )
    }

    fun stopDiscovery(): Task<Void> {
        client.stopDiscovery()
        return Tasks.forResult(null)
    }

    fun requestConnection(endpointId: String, displayName: String): Task<Void> =
        client.requestConnection(
            displayName,
            endpointId,
            connectionLifecycleCallback,
        )

    fun acceptConnection(endpointId: String): Task<Void> =
        client.acceptConnection(endpointId, payloadCallback)

    fun rejectConnection(endpointId: String): Task<Void> =
        client.rejectConnection(endpointId)

    fun sendMessage(endpointId: String, message: String): Task<Void> =
        client.sendPayload(
            endpointId,
            Payload.fromBytes(message.toByteArray(Charsets.UTF_8)),
        )

    fun disconnect(endpointId: String?): Task<Void> {
        if (endpointId.isNullOrBlank()) {
            client.stopAllEndpoints()
            return Tasks.forResult<Void>(null)
        } else {
            client.disconnectFromEndpoint(endpointId)
            return Tasks.forResult<Void>(null)
        }
    }

    fun shutdown() {
        client.stopAdvertising()
        client.stopDiscovery()
        client.stopAllEndpoints()
    }

    interface Listener {
        fun onPeerFound(endpointId: String, name: String)
        fun onPeerLost(endpointId: String)
        fun onConnectionRequested(endpointId: String, name: String)
        fun onConnectionStateChanged(endpointId: String, state: String, name: String?)
        fun onMessageReceived(endpointId: String, message: String)
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            listener.onPeerFound(endpointId, info.endpointName)
        }

        override fun onEndpointLost(endpointId: String) {
            listener.onPeerLost(endpointId)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            listener.onConnectionRequested(endpointId, info.endpointName)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            val state = if (result.status.isSuccess) "connected" else "rejected"
            listener.onConnectionStateChanged(endpointId, state, null)
        }

        override fun onDisconnected(endpointId: String) {
            listener.onConnectionStateChanged(endpointId, "disconnected", null)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            listener.onMessageReceived(endpointId, bytes.toString(Charsets.UTF_8))
        }

        override fun onPayloadTransferUpdate(
            endpointId: String,
            update: PayloadTransferUpdate,
        ) {
        }
    }
}
