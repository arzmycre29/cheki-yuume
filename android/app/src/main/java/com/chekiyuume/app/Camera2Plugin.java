package com.chekiyuume.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.nio.ByteBuffer;
import java.util.Collections;

@CapacitorPlugin(
    name = "Camera2",
    permissions = {
        @Permission(
            strings = { Manifest.permission.CAMERA },
            alias = "camera"
        )
    }
)
public class Camera2Plugin extends Plugin {
    private static final String TAG = "Camera2Plugin";

    private HandlerThread mBackgroundThread;
    private Handler mBackgroundHandler;

    private void startBackgroundThread() {
        if (mBackgroundThread == null) {
            mBackgroundThread = new HandlerThread("Camera2Background");
            mBackgroundThread.start();
            mBackgroundHandler = new Handler(mBackgroundThread.getLooper());
        }
    }

    private void stopBackgroundThread() {
        if (mBackgroundThread != null) {
            mBackgroundThread.quitSafely();
            try {
                mBackgroundThread.join();
                mBackgroundThread = null;
                mBackgroundHandler = null;
            } catch (InterruptedException e) {
                Log.e(TAG, "Background thread interrupted", e);
            }
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        stopBackgroundThread();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        startBackgroundThread();
    }

    @PluginMethod
    public void getCameras(PluginCall call) {
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) {
                call.reject("CameraManager not available");
                return;
            }

            String[] cameraIds = manager.getCameraIdList();
            JSArray resultList = new JSArray();

            for (String id : cameraIds) {
                try {
                    CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                    Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);

                    String facingStr = "unknown";
                    boolean isExternal = false;
                    String friendlyName = "Kamera " + id;

                    if (facing != null) {
                        if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
                            facingStr = "front";
                            friendlyName = "📱 Kamera Depan (ID " + id + ")";
                        } else if (facing == CameraCharacteristics.LENS_FACING_BACK) {
                            facingStr = "back";
                            friendlyName = "📷 Kamera Belakang (ID " + id + ")";
                        } else if (facing == CameraCharacteristics.LENS_FACING_EXTERNAL) {
                            facingStr = "external";
                            isExternal = true;
                            friendlyName = "📹 USB OTG Camera (ID " + id + ")";
                        }
                    }

                    // Get highest resolution
                    StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                    String maxRes = "1920x1080";
                    if (map != null) {
                        Size[] jpegSizes = map.getOutputSizes(ImageFormat.JPEG);
                        if (jpegSizes != null && jpegSizes.length > 0) {
                            maxRes = jpegSizes[0].getWidth() + "x" + jpegSizes[0].getHeight();
                        }
                    }

                    JSObject camObj = new JSObject();
                    camObj.put("id", id);
                    camObj.put("name", friendlyName);
                    camObj.put("facing", facingStr);
                    camObj.put("isExternal", isExternal);
                    camObj.put("maxResolution", maxRes);

                    resultList.put(camObj);
                } catch (Exception ex) {
                    Log.w(TAG, "Could not inspect camera id " + id, ex);
                }
            }

            JSObject ret = new JSObject();
            ret.put("cameras", resultList);
            ret.put("total", cameraIds.length);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error listing Camera2 devices", e);
            call.reject("Failed to list Camera2 devices: " + e.getMessage());
        }
    }

    @PluginMethod
    public void capturePhoto(PluginCall call) {
        startBackgroundThread();

        final String cameraId = call.getString("cameraId", "0");
        final int targetWidth = call.getInt("width", 1920);
        final int targetHeight = call.getInt("height", 1080);

        CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) {
            call.reject("CameraManager not available");
            return;
        }

        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            call.reject("CAMERA permission not granted");
            return;
        }

        try {
            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(@NonNull CameraDevice camera) {
                    try {
                        ImageReader reader = ImageReader.newInstance(targetWidth, targetHeight, ImageFormat.JPEG, 2);
                        reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                            @Override
                            public void onImageAvailable(ImageReader ir) {
                                Image image = null;
                                try {
                                    image = ir.acquireLatestImage();
                                    if (image != null) {
                                        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                                        byte[] bytes = new byte[buffer.remaining()];
                                        buffer.get(bytes);

                                        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                                        String dataUrl = "data:image/jpeg;base64," + base64;

                                        JSObject ret = new JSObject();
                                        ret.put("success", true);
                                        ret.put("dataUrl", dataUrl);
                                        call.resolve(ret);
                                    } else {
                                        call.reject("Failed to capture image buffer");
                                    }
                                } catch (Exception ex) {
                                    Log.e(TAG, "Error processing ImageReader buffer", ex);
                                    call.reject("Error reading photo buffer: " + ex.getMessage());
                                } finally {
                                    if (image != null) image.close();
                                    reader.close();
                                    camera.close();
                                }
                            }
                        }, mBackgroundHandler);

                        CaptureRequest.Builder captureBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                        captureBuilder.addTarget(reader.getSurface());
                        captureBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                        captureBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH);

                        camera.createCaptureSession(Collections.singletonList(reader.getSurface()), new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(@NonNull CameraCaptureSession session) {
                                try {
                                    session.capture(captureBuilder.build(), new CameraCaptureSession.CaptureCallback() {
                                        @Override
                                        public void onCaptureCompleted(@NonNull CameraCaptureSession session, @NonNull CaptureRequest request, @NonNull TotalCaptureResult result) {
                                            super.onCaptureCompleted(session, request, result);
                                            Log.d(TAG, "Camera2 photo capture completed successfully");
                                        }
                                    }, mBackgroundHandler);
                                } catch (CameraAccessException e) {
                                    Log.e(TAG, "Failed to execute still capture", e);
                                    camera.close();
                                    call.reject("Capture request error: " + e.getMessage());
                                }
                            }

                            @Override
                            public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                                camera.close();
                                call.reject("Failed to configure Camera2 capture session");
                            }
                        }, mBackgroundHandler);

                    } catch (Exception e) {
                        Log.e(TAG, "Error during capture setup", e);
                        camera.close();
                        call.reject("Setup error: " + e.getMessage());
                    }
                }

                @Override
                public void onDisconnected(@NonNull CameraDevice camera) {
                    camera.close();
                    call.reject("Camera disconnected");
                }

                @Override
                public void onError(@NonNull CameraDevice camera, int error) {
                    camera.close();
                    call.reject("Camera error code: " + error);
                }
            }, mBackgroundHandler);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open camera: " + cameraId, e);
            call.reject("Failed to open Camera2: " + e.getMessage());
        }
    }
}
