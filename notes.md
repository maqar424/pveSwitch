
- safe shut down of pve via "ssh user@proxmox-ip "sudo shutdown -h now", implemeant the ssh connection

- if tailscale isnt connected: "Connect via Tailscale" is a hyperlink to open the app.

- implement settings menu where all the ip adresses (there should be multiple) and other variables can be edited

- add widget

Bug:
- I just disconnected tailscale while the pve was on. The app started the booting countdown. after about 10 seconds it went back to the normal "offline state". please make sure the booting animation only starts after actually pressing the power on button