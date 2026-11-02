package com.krowastudios.tholos.nearbygame;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
        name = "NearbyGame",
        permissions = {
                @Permission(
                        alias = "nearby",
                        strings = {
                                Manifest.permission.BLUETOOTH_SCAN,
                                Manifest.permission.BLUETOOTH_CONNECT,
                                Manifest.permission.BLUETOOTH_ADVERTISE,
                                Manifest.permission.ACCESS_FINE_LOCATION
                        }
                )
        }
)
public class ExamplePlugin extends Plugin implements NearbyConnectionManager.Listener {

    private NearbyConnectionManager manager;

    @Override
    public void load() {
        manager = new NearbyConnectionManager(getContext(), this);
    }

    @PluginMethod
    public void startHosting(PluginCall call) {
        String serviceId = call.getString("serviceId");
        String displayName = call.getString("displayName");
        if (!requireText(call, serviceId, "serviceId") ||
                !requireText(call, displayName, "displayName")) {
            return;
        }

        runWithNearbyPermission(call, () -> manager.startAdvertising(serviceId, displayName));
    }

    @PluginMethod
    public void stopHosting(PluginCall call) {
        runWithNearbyPermission(call, manager::stopAdvertising);
    }

    @PluginMethod
    public void startDiscovering(PluginCall call) {
        String serviceId = call.getString("serviceId");
        if (!requireText(call, serviceId, "serviceId")) {
            return;
        }

        runWithNearbyPermission(call, () -> manager.startDiscovery(serviceId));
    }

    @PluginMethod
    public void stopDiscovering(PluginCall call) {
        runWithNearbyPermission(call, manager::stopDiscovery);
    }

    @PluginMethod
    public void requestConnection(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String displayName = call.getString("displayName");
        if (!requireText(call, endpointId, "endpointId") ||
                !requireText(call, displayName, "displayName")) {
            return;
        }

        runWithNearbyPermission(call, () -> manager.requestConnection(endpointId, displayName));
    }

    @PluginMethod
    public void acceptConnection(PluginCall call) {
        String endpointId = call.getString("endpointId");
        Boolean accept = call.getBoolean("accept");
        if (!requireText(call, endpointId, "endpointId") || accept == null) {
            if (accept == null) {
                call.reject("accept is required");
            }
            return;
        }

        runWithNearbyPermission(call, () -> {
            if (accept) {
                return manager.acceptConnection(endpointId);
            }
            return manager.rejectConnection(endpointId);
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String message = call.getString("message");
        if (!requireText(call, endpointId, "endpointId") ||
                message == null) {
            if (message == null) {
                call.reject("message is required");
            }
            return;
        }

        runWithNearbyPermission(call, () -> manager.sendMessage(endpointId, message));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        runWithNearbyPermission(call, () -> manager.disconnect(call.getString("endpointId")));
    }

    @PluginMethod
    public void echo(PluginCall call) {
        String value = call.getString("value");
        JSObject ret = new JSObject();
        ret.put("value", new Example().echo(value));
        call.resolve(ret);
    }

    private void runWithNearbyPermission(PluginCall call, TaskSupplier operation) {
        if (getPermissionState("nearby") != PermissionState.GRANTED) {
            requestPermissionForAlias("nearby", call, "nearbyPermissions");
            return;
        }

        operation.run()
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(error -> call.reject("Nearby operation failed", error));
    }

    @PermissionCallback
    private void nearbyPermissions(PluginCall call) {
        if (getPermissionState("nearby") != PermissionState.GRANTED) {
            call.reject("Nearby permissions are required");
            return;
        }

        switch (call.getMethodName()) {
            case "startHosting":
                startHosting(call);
                break;
            case "stopHosting":
                stopHosting(call);
                break;
            case "startDiscovering":
                startDiscovering(call);
                break;
            case "stopDiscovering":
                stopDiscovering(call);
                break;
            case "requestConnection":
                requestConnection(call);
                break;
            case "acceptConnection":
                acceptConnection(call);
                break;
            case "sendMessage":
                sendMessage(call);
                break;
            case "disconnect":
                disconnect(call);
                break;
            default:
                call.reject("Unknown Nearby operation");
        }
    }

    private boolean requireText(PluginCall call, String value, String name) {
        if (value == null || value.isBlank()) {
            call.reject(name + " is required");
            return false;
        }
        return true;
    }

    @Override
    public void handleOnDestroy() {
        if (manager != null) {
            manager.shutdown();
        }
        super.handleOnDestroy();
    }

    @Override
    public void onPeerFound(String endpointId, String name) {
        JSObject peer = new JSObject();
        peer.put("endpointId", endpointId);
        peer.put("name", name);
        notifyListeners("peerFound", peer);
    }

    @Override
    public void onPeerLost(String endpointId) {
        notifyListeners("peerLost", new JSObject().put("endpointId", endpointId));
    }

    @Override
    public void onConnectionRequested(String endpointId, String name) {
        notifyConnectionChanged(endpointId, "requested", name);
    }

    @Override
    public void onConnectionStateChanged(String endpointId, String state, String name) {
        notifyConnectionChanged(endpointId, state, name);
    }

    @Override
    public void onMessageReceived(String endpointId, String message) {
        JSObject event = new JSObject();
        event.put("endpointId", endpointId);
        event.put("message", message);
        notifyListeners("messageReceived", event);
    }

    private void notifyConnectionChanged(String endpointId, String state, String name) {
        JSObject event = new JSObject();
        event.put("endpointId", endpointId);
        event.put("state", state);
        if (name != null) {
            event.put("name", name);
        }
        notifyListeners("connectionChanged", event);
    }

    private interface TaskSupplier {
        com.google.android.gms.tasks.Task<Void> run();
    }
}
