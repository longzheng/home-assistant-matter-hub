import { BridgeData } from "@home-assistant-matter-hub/common";
import Box from "@mui/material/Box";
import { Alert, Chip, Paper, Stack, Typography } from "@mui/material";
import QRCode from "react-qr-code";
import Grid from "@mui/material/Grid2";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { FabricList } from "../fabric/FabricList.tsx";

export interface BridgeDetailsProps {
  readonly bridge: BridgeData;
}

export const BridgeDetails = ({ bridge }: BridgeDetailsProps) => {
  return (
    <Paper sx={{ padding: 2 }}>
      <Stack spacing={2}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: "auto" }}>
            <Pairing bridge={bridge} />
          </Grid>
          <Grid size={{ xs: 12, md: "grow" }}>
            <BasicInfo bridge={bridge} />
          </Grid>
          <Grid size={{ xs: 12, md: "grow" }}>
            <CommissioningInfo bridge={bridge} />
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {bridge.filter.include.map((filter, idx) => (
            <Chip
              key={idx}
              size="small"
              icon={<AddIcon />}
              label={
                <span>
                  <strong>{filter.type}</strong>: {filter.value}
                </span>
              }
              color="success"
            />
          ))}
          {bridge.filter.exclude.map((filter, idx) => (
            <Chip
              key={idx}
              size="small"
              icon={<RemoveIcon />}
              label={
                <span>
                  <strong>{filter.type}</strong>: {filter.value}
                </span>
              }
              color="error"
            />
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
};

const Pairing = (props: { bridge: BridgeData }) => {
  if (!props.bridge.commissioning) {
    return <></>;
  }
  return (
    <Box display="flex" justifyContent="center">
      <Box position="relative" maxWidth="160px">
        {props.bridge.commissioning.isCommissioned && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            sx={{ transform: "translate(-50%, -50%) rotate(-45deg)" }}
          >
            <Alert color="success" variant="filled">
              Commissioned
            </Alert>
          </Box>
        )}
        <QRCode
          value={props.bridge.commissioning.qrPairingCode}
          style={{ width: "100%", height: "100%" }}
        />
      </Box>
    </Box>
  );
};

const BasicInfo = (props: { bridge: BridgeData }) => {
  return (
    <>
      <Typography variant="subtitle2" component="div">
        <div>ID: {props.bridge.id}</div>
        <div>Name: {props.bridge.name}</div>
        <div>Port: {props.bridge.port}</div>
        <div>
          <div>Fabrics:</div>
          <div style={{ fontSize: "1.5em" }}>
            {props.bridge.commissioning?.fabrics && (
              <FabricList fabrics={props.bridge.commissioning.fabrics} />
            )}
          </div>
        </div>
      </Typography>
    </>
  );
};

const CommissioningInfo = (props: { bridge: BridgeData }) => {
  if (!props.bridge.commissioning) {
    return <></>;
  }
  return (
    <Typography variant="subtitle2" component="div">
      <div>Passcode: {props.bridge.commissioning.passcode}</div>
      <div>Discriminator: {props.bridge.commissioning.discriminator}</div>
      <div>
        Manual Pairing Code: {props.bridge.commissioning.manualPairingCode}
      </div>
      <div>QR Pairing Code: {props.bridge.commissioning.qrPairingCode}</div>
    </Typography>
  );
};
