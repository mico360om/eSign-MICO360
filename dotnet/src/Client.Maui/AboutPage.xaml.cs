namespace EsignMico360.Client.Maui;

public partial class AboutPage : ContentPage
{
    public AboutPage() => InitializeComponent();

    protected override void OnAppearing()
    {
        base.OnAppearing();
        VersionLabel.Text = "Version 1.0.0 · company-sync prototype";
        ServerLabel.Text = ServerConfig.CurrentUrl;
    }
}
